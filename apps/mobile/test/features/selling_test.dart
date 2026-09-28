import 'package:commerce_mobile/app/services.dart';
import 'package:commerce_mobile/core/files/file_source.dart';
import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:commerce_mobile/core/util/money.dart';
import 'package:commerce_mobile/design/design.dart';
import 'package:commerce_mobile/domain/selling.dart';
import 'package:flutter_test/flutter_test.dart';

import '../app_smoke_test.dart' show boot;
import '../support/fake_api.dart';

Map<String, Object?> seller(String status, {String? reason}) => {
  'id': 'seller-1',
  'ownerUserId': 'user-1',
  'businessName': 'Zawadi Dealers Ltd',
  'displayName': 'Zawadi',
  'status': status,
  'reviewReason': reason,
  'version': 3,
};

Map<String, Object?> fulfillment({
  required String status,
  bool awaiting = false,
  int packed = 0,
  int dispatched = 0,
}) => {
  'id': 'fo-1',
  'version': 7,
  'status': status,
  'awaitingAcceptance': awaiting,
  'acceptedAt': awaiting ? null : '2026-09-24T10:00:00Z',
  'heldReason': null,
  'lines': [
    {
      'id': 'fl-1',
      'orderItemId': 'item-1',
      'allocatedQuantity': 2,
      'pickedQuantity': awaiting ? 0 : 2,
      'packedQuantity': packed,
      'shipmentAssignedQuantity': dispatched,
      'dispatchedQuantity': dispatched,
      'cancelledQuantity': 0,
    },
  ],
  'events': <Object>[],
};

Map<String, Object?> sellerOrder(Map<String, Object?> fo) => {
  'id': 'so-1',
  'orderId': 'abcdef12-0000-4000-8000-000000000000',
  'sellerId': 'seller-1',
  'status': 'PAID',
  'subtotal': 900000,
  'shippingAmount': 3000,
  'total': 903000,
  'currency': 'ZMW',
  'createdAt': '2026-09-24T09:00:00Z',
  'items': [
    {
      'id': 'item-1',
      'offerId': 'offer-1',
      'quantity': 2,
      'unitAmount': 450000,
      'lineTotal': 900000,
      'currency': 'ZMW',
    },
  ],
  'fulfillmentOrders': [
    {
      'id': fo['id'],
      'status': fo['status'],
      'awaitingAcceptance': fo['awaitingAcceptance'],
    },
  ],
  'shippingGroups': [
    {
      'id': 'sg-1',
      'fulfillmentMode': 'SELLER',
      'methodName': 'Standard',
      'destination': {'city': 'Lusaka', 'region': null, 'country': 'ZM'},
      'fulfillmentOrders': [fo],
      'shipments': <Object>[],
    },
  ],
};

Future<(AppServices, FakeApi)> signedInSeller(
  WidgetTester tester, {
  required Map<String, Object?>? account,
  Map<String, Object?> Function()? order,
  FileSource? files,
}) async {
  final store = MemoryKeyValueStore()
    ..values['commerce.refresh_token'] = 'stored';
  return boot(
    tester,
    store: store,
    files: files,
    configure: (api) {
      api.on(
        'POST /auth/refresh',
        (_) => FakeApi.ok(sessionJson(role: 'SELLER')),
      );
      api.on(
        'GET /cart',
        (_) =>
            FakeApi.ok({'items': <Object>[], 'subtotal': 0, 'currency': 'ZMW'}),
      );
      api.on('GET /wishlist', (_) => FakeApi.ok(<Object>[]));
      api.on(
        'GET /sellers/me',
        (_) => account == null
            ? FakeApi.error(404, 'NOT_FOUND', 'Seller application not found')
            : FakeApi.ok(account),
      );
      api.on(
        'GET /sellers/me/balance',
        (_) => FakeApi.ok({
          'sellerId': 'seller-1',
          'balance': 120000,
          'availableBalance': 120000,
          'heldBalance': 810000,
          'pendingPayoutBalance': 0,
          'paidBalance': 0,
          'currency': 'ZMW',
        }),
      );
      if (order != null) {
        api.on(
          'GET /sellers/me/orders',
          (_) => FakeApi.ok({
            'items': [order()],
            'total': 1,
            'page': 1,
            'limit': 50,
          }),
        );
        api.on('GET /sellers/me/orders/so-1', (_) => FakeApi.ok(order()));
      }
      api.on(
        'GET /sellers/me/offers',
        (_) => FakeApi.ok({
          'items': <Object>[],
          'total': 4,
          'page': 1,
          'limit': 1,
        }),
      );
      api.on(
        'GET /sellers/me/offers/offer-1',
        (_) => FakeApi.ok({'id': 'offer-1', 'listingTitle': 'Laptop i7'}),
      );
    },
  );
}

Future<void> openSelling(WidgetTester tester) async {
  await tester.tap(find.text('Selling'));
  await tester.pumpAndSettle();
}

void main() {
  test('reads a typed price as minor units', () {
    expect(parseMoneyInput('4500'), 450000);
    expect(parseMoneyInput('4,500.5'), 450050);
    expect(parseMoneyInput('K 99.99'), 9999);
    expect(parseMoneyInput('1.2.3'), isNull);
    expect(parseMoneyInput(''), isNull);
  });

  test('a fulfilment offers only the steps its quantities allow', () {
    final awaiting = Fulfillment.fromJson(
      fulfillment(status: 'AWAITING_ACCEPTANCE', awaiting: true),
    );
    expect(awaiting.stage, FulfillmentStage.awaitingAcceptance);
    expect(awaiting.canAnswer, isTrue);
    expect(awaiting.canPack, isFalse, reason: 'answer first');

    final picked = Fulfillment.fromJson(fulfillment(status: 'PICKED'));
    expect((picked.canPack, picked.canDispatch), (true, false));

    final packed = Fulfillment.fromJson(
      fulfillment(status: 'PACKED', packed: 2),
    );
    expect((packed.canPack, packed.canDispatch), (false, true));

    final sent = Fulfillment.fromJson(
      fulfillment(status: 'DISPATCHED', packed: 2, dispatched: 2),
    );
    expect(
      (sent.canPack, sent.canDispatch, sent.canCancel),
      (false, false, false),
    );
  });

  testWidgets('someone who has not applied is told how to start', (
    tester,
  ) async {
    await signedInSeller(tester, account: null);
    await openSelling(tester);
    expect(find.text('Start selling'), findsOneWidget);
  });

  testWidgets('a pending application says it is under review', (tester) async {
    await signedInSeller(tester, account: seller('PENDING'));
    await openSelling(tester);
    expect(find.text('Your application is being reviewed'), findsOneWidget);
  });

  testWidgets('a rejected application shows the reason', (tester) async {
    await signedInSeller(
      tester,
      account: seller('REJECTED', reason: 'Registration number unreadable'),
    );
    await openSelling(tester);
    expect(find.textContaining('Registration number unreadable'), findsOne);
  });

  testWidgets('an approved seller sees earnings and what needs them', (
    tester,
  ) async {
    await signedInSeller(
      tester,
      account: seller('APPROVED'),
      order: () => sellerOrder(
        fulfillment(status: 'AWAITING_ACCEPTANCE', awaiting: true),
      ),
    );
    await openSelling(tester);

    expect(find.text('Zawadi'), findsOneWidget, reason: 'shop name as title');
    expect(
      find.bySemanticsLabel('Earnings: K1,200.00 available to pay out'),
      findsOneWidget,
    );
    expect(find.textContaining('waiting for you to accept'), findsOneWidget);
    expect(find.text('4 listings'), findsOneWidget);
  });

  testWidgets('accepting an order sends its version, then pack and send', (
    tester,
  ) async {
    var fo = fulfillment(status: 'AWAITING_ACCEPTANCE', awaiting: true);
    final (_, api) = await signedInSeller(
      tester,
      account: seller('APPROVED'),
      order: () => sellerOrder(fo),
    );
    api.on('POST /sellers/me/fulfillments/fo-1/accept', (_) {
      fo = fulfillment(status: 'PICKED');
      return FakeApi.ok({'id': 'fo-1'});
    });
    api.on('POST /sellers/me/fulfillments/fo-1/packs', (_) {
      fo = fulfillment(status: 'PACKED', packed: 2);
      return FakeApi.ok({'id': 'fo-1'});
    });
    api.on('POST /sellers/me/fulfillments/fo-1/dispatches', (_) {
      fo = fulfillment(status: 'DISPATCHED', packed: 2, dispatched: 2);
      return FakeApi.ok({'id': 'fo-1'});
    });

    await openSelling(tester);
    await tester.tap(find.text('Orders'));
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel(RegExp(r'^Order ABCDEF12')).first);
    await tester.pumpAndSettle();
    expect(find.text('Laptop i7'), findsOneWidget, reason: 'line titled');

    await tester.tap(find.widgetWithText(Button, 'Accept order'));
    await tester.pumpAndSettle();
    expect(
      FakeApi.body(
        api.calls('POST /sellers/me/fulfillments/fo-1/accept').single,
      ),
      {'version': 7},
    );

    await tester.tap(find.widgetWithText(Button, 'Mark as packed'));
    await tester.pumpAndSettle();
    final pack = api.calls('POST /sellers/me/fulfillments/fo-1/packs').single;
    expect(FakeApi.body(pack), {
      'lines': [
        {'fulfillmentLineId': 'fl-1', 'quantity': 2},
      ],
    });
    expect(pack.headers['Idempotency-Key'], isNotNull);

    await tester.tap(find.widgetWithText(Button, 'Mark as sent'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(InputField, 'Courier'),
      'Postnet',
    );
    await tester.tap(find.widgetWithText(Button, 'Mark as sent').last);
    await tester.pumpAndSettle();
    expect(
      FakeApi.body(
        api.calls('POST /sellers/me/fulfillments/fo-1/dispatches').single,
      ),
      {
        'lines': [
          {'fulfillmentLineId': 'fl-1', 'quantity': 2},
        ],
        'carrierCode': 'Postnet',
      },
    );
    expect(find.widgetWithText(Button, 'Mark as sent'), findsNothing);
  });
}
