import 'package:commerce_mobile/app/services.dart';
import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:commerce_mobile/design/design.dart';
import 'package:commerce_mobile/features/home/home_page.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../app_smoke_test.dart' show boot;
import '../support/fake_api.dart';

/// Signed in, one item in the cart, one saved address, on the checkout
/// screen with the card form open.
Future<(AppServices, FakeApi)> openCardCheckout(
  WidgetTester tester, {
  required Map<String, Object?> Function(int attempt) payment,
}) async {
  var attempt = 0;
  final store = MemoryKeyValueStore()
    ..values['commerce.refresh_token'] = 'stored';
  final (services, api) = await boot(
    tester,
    store: store,
    configure: (api) {
      api.on('POST /auth/refresh', (_) => FakeApi.ok(sessionJson()));
      api.on(
        'GET /cart',
        (_) => FakeApi.ok({
          'items': [
            {
              'id': 'line-1',
              'offerId': 'offer-1',
              'quantity': 1,
              'lineTotal': 450000,
            },
          ],
          'subtotal': 450000,
          'currency': 'ZMW',
        }),
      );
      api.on('GET /wishlist', (_) => FakeApi.ok(<Object>[]));
      api.on(
        'GET /users/me/addresses',
        (_) => FakeApi.ok([
          {
            'id': 'addr-1',
            'recipientName': 'Test Buyer',
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
          'subtotal': 450000,
          'shippingAmount': 0,
          'total': 450000,
          'shippingGroups': <Object>[],
        }),
      );
      api.on('POST /checkout', (_) {
        attempt++;
        return FakeApi.ok({
          'order': {'id': 'order-$attempt'},
          'payment': payment(attempt),
        }, status: 201);
      });
      api.on(
        'POST /payments/pay-1/status',
        (_) => FakeApi.ok({
          'id': 'pay-1',
          'orderId': 'order-1',
          'localStatus': 'SUCCEEDED',
        }),
      );
    },
  );
  expect(services.session.isSignedIn, isTrue);
  await tester.pumpAndSettle();
  expect(services.cart.itemCount, 1);

  GoRouter.of(tester.element(find.byType(HomePage))).push('/checkout');
  await tester.pumpAndSettle();
  await tester.tap(find.text('Card'));
  await tester.pumpAndSettle();
  return (services, api);
}

Future<void> fillCard(WidgetTester tester) async {
  Finder field(String label) => find.widgetWithText(InputField, label);
  await tester.enterText(field('Card number'), '4111111111111111');
  await tester.enterText(field('Expiry'), '1230');
  await tester.enterText(field('Security code'), '123');
  await tester.enterText(field('Name on card'), 'Test Buyer');
  await tester.pumpAndSettle();
}

Future<void> pay(WidgetTester tester) async {
  await tester.tap(find.widgetWithText(Button, 'Pay by card'));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('the card form formats as you type and names the brand', (
    tester,
  ) async {
    await openCardCheckout(tester, payment: (_) => {});
    await fillCard(tester);

    expect(find.text('4111 1111 1111 1111'), findsOneWidget);
    expect(find.text('12/30'), findsOneWidget);
    expect(find.text('Visa'), findsOneWidget);
    expect(find.text('Bill to the delivery address'), findsOneWidget);
    expect(find.textContaining('US dollars'), findsOneWidget);
  });

  testWidgets('tapping pay on an empty card form says what is missing', (
    tester,
  ) async {
    final (_, api) = await openCardCheckout(tester, payment: (_) => {});
    await pay(tester);

    expect(api.calls('POST /checkout'), isEmpty);
    expect(find.text('Check the card number'), findsOneWidget);
    expect(find.text('Enter the expiry as MM/YY'), findsOneWidget);
    expect(find.text('Enter the 3 digits on the back'), findsOneWidget);
  });

  testWidgets('a declined card stays on checkout and keeps the cart', (
    tester,
  ) async {
    final (services, api) = await openCardCheckout(
      tester,
      payment: (attempt) => {
        'id': 'pay-$attempt',
        'status': 'FAILED',
        'failureReason': 'PAYMENT_DECLINED',
      },
    );
    await fillCard(tester);
    await pay(tester);

    expect(api.calls('POST /checkout'), hasLength(1));
    expect(find.textContaining('Your bank declined this card'), findsOneWidget);
    expect(find.widgetWithText(Button, 'Pay by card'), findsOneWidget);
    expect(
      services.cart.itemCount,
      1,
      reason: 'the API keeps the cart when a payment fails',
    );
  });

  testWidgets('an approved card goes on to the payment screen, confirmed', (
    tester,
  ) async {
    await openCardCheckout(
      tester,
      payment: (attempt) => {'id': 'pay-$attempt', 'status': 'SUCCEEDED'},
    );
    await fillCard(tester);
    await pay(tester);

    expect(find.text('Payment received'), findsOneWidget);
    expect(find.widgetWithText(Button, 'View order'), findsOneWidget);
  });
}
