import 'package:commerce_mobile/core/config/api_endpoint.dart';
import 'package:commerce_mobile/core/network/api_client.dart';
import 'package:commerce_mobile/data/commerce_repositories.dart';
import 'package:commerce_mobile/domain/checkout.dart';
import 'package:commerce_mobile/domain/orders.dart';
import 'package:commerce_mobile/features/checkout/checkout_controller.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;

import '../support/fake_api.dart';

final _uuidV4 = RegExp(
  r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
);

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
    api.on(
      'GET /users/me/addresses',
      (_) => FakeApi.ok([
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
      ]),
    );
    api.on(
      'POST /checkout/quote',
      (_) => FakeApi.ok({
        'currency': 'ZMW',
        'subtotal': 900000,
        'shippingAmount': 0,
        'total': 900000,
        'shippingGroups': <Object>[],
      }),
    );
    checkout = CheckoutController(
      account: AccountRepository(client),
      checkout: CheckoutRepository(client),
      email: 'buyer@example.test',
      now: () => DateTime(2026, 9, 24),
    );
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

    final keys = api
        .calls('POST /checkout')
        .map((r) => r.headers['Idempotency-Key'])
        .toList();
    expect(keys, hasLength(2));
    expect(
      keys[0],
      keys[1],
      reason: 'same order → same key → no double charge',
    );
    expect(
      keys[0],
      matches(_uuidV4),
      reason: 'the API rejects anything but v4',
    );
    expect(result!.orderId, 'order-1');
  });

  test('changing the payment details is a new order, so a new key', () async {
    api.on(
      'POST /checkout',
      (_) => throw http.ClientException('connection reset'),
    );

    await checkout.placeOrder();
    checkout.setProvider(MobileMoneyProvider.airtel);
    await checkout.placeOrder();

    final keys = api
        .calls('POST /checkout')
        .map((r) => r.headers['Idempotency-Key'])
        .toSet();
    expect(keys, hasLength(2));
  });

  test('sends mobile money details in the shape the API validates', () async {
    api.on(
      'POST /checkout',
      (_) => FakeApi.ok({
        'order': {'id': 'order-1'},
        'payment': {'id': 'pay-1', 'status': 'PENDING'},
      }),
    );
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

  group('card', () {
    void fillCard() {
      checkout.setMethod(PaymentMethod.card);
      checkout.setCardNumber('4111 1111 1111 1111');
      checkout.setCardExpiry('12/30');
      checkout.setCardCode('123');
      checkout.setCardName('Test Buyer');
    }

    test('sends the card in the shape the API validates', () async {
      api.on(
        'POST /checkout',
        (_) => FakeApi.ok({
          'order': {'id': 'order-1'},
          'payment': {'id': 'pay-1', 'status': 'SUCCEEDED'},
        }),
      );
      fillCard();
      final result = await checkout.placeOrder();

      expect(result!.paymentStatus, PaymentStatus.succeeded);
      final body = FakeApi.body(api.calls('POST /checkout').single);
      expect(body['paymentDetails'], {
        'paymentMethod': 'CARD',
        'card': {
          'number': '4111111111111111',
          'expiryMonth': '12',
          'expiryYear': '2030',
          'securityCode': '123',
          'holderName': 'Test Buyer',
          'billing': {
            'firstName': 'Test',
            'lastName': 'Buyer',
            'address1': 'Plot 12 Cairo Rd',
            'locality': 'Lusaka',
            'administrativeArea': 'Lusaka',
            'postalCode': '10101',
            'country': 'ZM',
            'email': 'buyer@example.test',
          },
        },
      });
    });

    test('forgets the card once the order is placed', () async {
      api.on(
        'POST /checkout',
        (_) => FakeApi.ok({
          'order': {'id': 'order-1'},
          'payment': {'id': 'pay-1', 'status': 'SUCCEEDED'},
        }),
      );
      fillCard();
      await checkout.placeOrder();
      expect(checkout.cardValid, isFalse, reason: 'nothing left in memory');
    });

    test('an incomplete card is pointed out, not sent', () async {
      checkout.setMethod(PaymentMethod.card);
      checkout.setCardNumber('4111 1111');
      expect(
        checkout.canSubmit,
        isTrue,
        reason: 'the tap shows what is missing',
      );
      expect(checkout.cardNumberError, isNull, reason: 'not while typing');

      expect(await checkout.placeOrder(), isNull);
      expect(api.calls('POST /checkout'), isEmpty);
      expect(checkout.cardNumberError, 'Check the card number');
      expect(checkout.cardExpiryError, isNotNull);
      expect(checkout.cardCodeError, isNotNull);
      expect(checkout.cardNameError, isNotNull);
    });

    test('a decline keeps the shopper on checkout with a fresh key', () async {
      var attempt = 0;
      api.on('POST /checkout', (_) {
        attempt++;
        return FakeApi.ok({
          'order': {'id': 'order-$attempt', 'status': 'CANCELLED'},
          'payment': {
            'id': 'pay-$attempt',
            'status': attempt == 1 ? 'FAILED' : 'SUCCEEDED',
            'failureReason':
                'VALIDATION_ERROR: The payment request was rejected as invalid',
          },
        });
      });
      fillCard();

      expect(await checkout.placeOrder(), isNull);
      expect(checkout.placeError, contains('Check the number'));
      expect(checkout.cardValid, isTrue, reason: 'details kept to correct');

      final retry = await checkout.placeOrder();
      expect(retry!.orderId, 'order-2');
      final keys = api
          .calls('POST /checkout')
          .map((r) => r.headers['Idempotency-Key'])
          .toSet();
      expect(
        keys,
        hasLength(2),
        reason: 'the declined order is closed; its key would replay it',
      );
    });

    test('switching method is a different order, so a new key', () async {
      api.on(
        'POST /checkout',
        (_) => throw http.ClientException('connection reset'),
      );
      await checkout.placeOrder();
      fillCard();
      await checkout.placeOrder();
      final keys = api
          .calls('POST /checkout')
          .map((r) => r.headers['Idempotency-Key'])
          .toSet();
      expect(keys, hasLength(2));
    });

    test('billing typed by hand is validated and sent', () async {
      api.on(
        'POST /checkout',
        (_) => FakeApi.ok({
          'order': {'id': 'order-1'},
          'payment': {'id': 'pay-1', 'status': 'SUCCEEDED'},
        }),
      );
      fillCard();
      checkout.setBillingSameAsDelivery(false);
      expect(checkout.cardValid, isFalse);
      checkout.setBilling(
        const BillingDraft(
          line1: '1 Main St',
          city: 'Ndola',
          postalCode: '10101',
          country: 'zm',
        ),
      );
      await checkout.placeOrder();
      final card =
          (FakeApi.body(api.calls('POST /checkout').single)['paymentDetails']
                  as Map)['card']
              as Map;
      expect(card['billing'], containsPair('locality', 'Ndola'));
      expect(card['billing'], containsPair('administrativeArea', 'Ndola'));
      expect(card['billing'], containsPair('country', 'ZM'));
    });
  });
}
