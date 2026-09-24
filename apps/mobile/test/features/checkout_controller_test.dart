import 'package:commerce_mobile/core/config/api_endpoint.dart';
import 'package:commerce_mobile/core/network/api_client.dart';
import 'package:commerce_mobile/data/commerce_repositories.dart';
import 'package:commerce_mobile/domain/checkout.dart';
import 'package:commerce_mobile/features/checkout/checkout_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../support/fake_api.dart';

final _uuidV4 = RegExp(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

void main() {
  late FakeApi api;
  late CheckoutController checkout;

  setUp(() async {
    api = FakeApi();
    final client = ApiClient(
      endpoint: ApiEndpoint.fixed(Uri.parse('https://api.example.test/api/v1')),
      httpClient: api.client,
      retryDelays: const [],
    );
    api.on('GET /users/me/addresses', (_) => FakeApi.ok([
          {
            'id': 'addr-1',
            'recipientName': 'Test Buyer',
            'phone': '0971234567',
            'line1': 'Plot 12 Cairo Rd',
            'city': 'Lusaka',
            'postalCode': '10101',
            'country': 'ZM',
            'isDefault': true,
          },
        ]));
    api.on('POST /checkout/quote', (_) => FakeApi.ok({
          'currency': 'ZMW',
          'subtotal': 900000,
          'shippingAmount': 0,
          'total': 900000,
          'shippingGroups': <Object>[],
        }));
    checkout = CheckoutController(
        account: AccountRepository(client), checkout: CheckoutRepository(client));
    await checkout.start();
  });

  test('picks the default address, prefills its phone and quotes', () {
    expect(checkout.address!.id, 'addr-1');
    expect(checkout.phone, '0971234567');
    expect(checkout.quote!.total, 900000);
    expect(checkout.canPlace, isTrue);
  });

  test('refuses an obviously wrong mobile money number before sending', () {
    checkout.setPhone('12345');
    expect(checkout.phoneValid, isFalse);
    expect(checkout.canPlace, isFalse);
    checkout.setPhone('+260 97 123 4567');
    expect(checkout.phoneValid, isTrue);
  });

  test('a retry after a lost reply reuses the idempotency key', () async {
    var attempt = 0;
    api.on('POST /checkout', (_) {
      // First attempt: the server processed it but the reply never arrived.
      if (++attempt == 1) throw http.ClientException('connection reset');
      return FakeApi.ok({
        'order': {'id': 'order-1'},
        'payment': {'id': 'pay-1', 'status': 'PENDING'},
      });
    });

    expect(await checkout.placeOrder(), isNull);
    expect(checkout.placeError, isNotNull);
    final result = await checkout.placeOrder();

    final keys = api.calls('POST /checkout')
        .map((r) => r.headers['Idempotency-Key'])
        .toList();
    expect(keys, hasLength(2));
    expect(keys[0], keys[1], reason: 'same order → same key → no double charge');
    expect(keys[0], matches(_uuidV4), reason: 'the API rejects anything but v4');
    expect(result!.orderId, 'order-1');
  });

  test('changing the payment details is a new order, so a new key', () async {
    api.on('POST /checkout', (_) => throw http.ClientException('connection reset'));

    await checkout.placeOrder();
    checkout.setProvider(MobileMoneyProvider.airtel);
    await checkout.placeOrder();

    final keys = api.calls('POST /checkout')
        .map((r) => r.headers['Idempotency-Key'])
        .toSet();
    expect(keys, hasLength(2));
  });

  test('sends mobile money details in the shape the API validates', () async {
    api.on('POST /checkout', (_) => FakeApi.ok({
          'order': {'id': 'order-1'},
          'payment': {'id': 'pay-1', 'status': 'PENDING'},
        }));
    checkout.setPhone('097 123-4567');
    await checkout.placeOrder();

    final body = FakeApi.body(api.calls('POST /checkout').single);
    expect(body['shippingAddressId'], 'addr-1');
    expect(body['currency'], 'ZMW');
    expect(body['paymentDetails'], {
      'paymentMethod': 'MOBILE_MONEY',
      'provider': 'MTN',
      'phoneNumber': '0971234567',
    });
  });
}
