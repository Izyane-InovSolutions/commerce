import 'dart:typed_data';

import 'package:commerce_mobile/core/files/file_source.dart';
import 'package:commerce_mobile/design/design.dart';
import 'package:commerce_mobile/domain/seller_catalog.dart';
import 'package:commerce_mobile/domain/seller_money.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../support/fake_api.dart';
import 'selling_test.dart' as fx;

/// Hands over one small PDF, whatever is asked for.
class _OneFile implements FileSource {
  @override
  Future<PickedFile?> pick(Set<FileKind> kinds) async => PickedFile(
    name: kinds.contains(FileKind.pdf) ? 'pacra.pdf' : 'front.jpg',
    bytes: Uint8List.fromList(List.filled(2048, 7)),
    mimeType: kinds.contains(FileKind.pdf) ? 'application/pdf' : 'image/jpeg',
  );
}

void _uploads(FakeApi api) {
  var n = 0;
  api.on('POST /media/uploads', (request) {
    n++;
    return FakeApi.ok({
      'asset': {'id': 'asset-$n', 'status': 'PENDING_UPLOAD'},
      'upload': {
        'url': '/api/v1/media/asset-$n/content?expires=1&signature=abc',
        'expiresAt': '2026-09-25T10:00:00Z',
      },
    }, status: 201);
  });
  for (var i = 1; i <= 5; i++) {
    api.on('PUT /media/asset-$i/content', (_) => FakeApi.ok(null, status: 204));
  }
}

Future<void> open(WidgetTester tester, String route, {Object? extra}) async {
  GoRouter.of(
    tester.element(find.byType(PageScaffold).first),
  ).push(route, extra: extra);
  await tester.pumpAndSettle();
}

Finder field(String label) => find.widgetWithText(InputField, label);

/// Taps [finder] after scrolling it into view — forms here run long.
Future<void> tapShown(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder.first);
  await tester.pumpAndSettle();
  await tester.tap(finder.first);
  await tester.pumpAndSettle();
}

void main() {
  test('slugs follow the API rule', () {
    expect(
      slugify('Aria Wireless Earbuds (Black)'),
      'aria-wireless-earbuds-black',
    );
    expect(slugify('  --Laptop  i7-- '), 'laptop-i7');
  });

  test('payout destinations carry the keys the API masks by', () {
    expect(
      const PayoutAccountDraft(
        method: PayoutMethod.mobileMoney,
        provider: 'MTN',
        holder: 'Z Dealers',
        number: '097 123-4567',
      ).toJson()['destination'],
      {'phoneNumber': '0971234567'},
    );
    expect(
      const PayoutAccountDraft(
        method: PayoutMethod.bank,
        provider: 'Zanaco',
        holder: 'Z Dealers',
        number: '0123456789',
        branch: 'Cairo Rd',
      ).toJson()['destination'],
      {'accountNumber': '0123456789', 'branch': 'Cairo Rd'},
    );
  });

  testWidgets('applying uploads the document, then sends the application', (
    tester,
  ) async {
    final (_, api) = await fx.signedInSeller(
      tester,
      account: null,
      files: _OneFile(),
    );
    _uploads(api);
    api.on('POST /sellers/applications', (_) {
      api.on('GET /sellers/me', (_) => FakeApi.ok(fx.seller('PENDING')));
      return FakeApi.ok(fx.seller('PENDING'), status: 201);
    });

    await fx.openSelling(tester);
    await tester.tap(find.widgetWithText(Button, 'Apply to sell'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Registered business name'), 'Zawadi Ltd');
    await tester.enterText(field('Registration number'), '120240001234');
    await tester.enterText(
      field('Business address'),
      'Plot 5, Cairo Rd, Lusaka',
    );
    await tapShown(tester, find.text('Add a document'));
    expect(find.text('pacra.pdf'), findsOneWidget);

    final upload = api.calls('PUT /media/asset-1/content').single;
    expect(upload.url.queryParameters, {'expires': '1', 'signature': 'abc'});
    expect(upload.headers['content-type'], startsWith('multipart/form-data'));
    expect(FakeApi.body(api.calls('POST /media/uploads').single), {
      'fileName': 'pacra.pdf',
      'mimeType': 'application/pdf',
      'byteSize': 2048,
    });

    await tester.tap(find.widgetWithText(Button, 'Send application'));
    await tester.pumpAndSettle();
    expect(FakeApi.body(api.calls('POST /sellers/applications').single), {
      'businessName': 'Zawadi Ltd',
      'registrationNumber': '120240001234',
      'country': 'ZM',
      'businessAddress': 'Plot 5, Cairo Rd, Lusaka',
      'contactEmail': 'buyer@example.test',
      'documentIds': ['asset-1'],
    });
    expect(find.text('Your application is being reviewed'), findsOneWidget);
  });

  testWidgets('an application without documents is not sent', (tester) async {
    final (_, api) = await fx.signedInSeller(tester, account: null);
    await fx.openSelling(tester);
    await tester.tap(find.widgetWithText(Button, 'Apply to sell'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(Button, 'Send application'));
    await tester.pumpAndSettle();
    expect(find.text('Add at least one document'), findsOneWidget);
    expect(api.calls('POST /sellers/applications'), isEmpty);
  });

  testWidgets('submitting a product sends product, variant, then photos', (
    tester,
  ) async {
    final (_, api) = await fx.signedInSeller(
      tester,
      account: fx.seller('APPROVED'),
      files: _OneFile(),
    );
    _uploads(api);
    api.on('GET /sellers/me/products', (_) => FakeApi.ok(<Object>[]));
    api.on('GET /catalog/categories', (_) => FakeApi.ok(<Object>[]));
    api.on('GET /catalog/brands', (_) => FakeApi.ok(<Object>[]));
    api.on(
      'POST /sellers/me/products',
      (_) => FakeApi.ok({'id': 'prod-1'}, status: 201),
    );
    api.on(
      'POST /sellers/me/products/prod-1/variants',
      (_) => FakeApi.ok({'id': 'var-1'}, status: 201),
    );
    api.on(
      'POST /sellers/me/products/prod-1/media',
      (_) => FakeApi.ok({'id': 'prod-1'}, status: 201),
    );
    api.on(
      'GET /sellers/me/products/prod-1',
      (_) => FakeApi.ok({
        'id': 'prod-1',
        'name': 'Aria Earbuds',
        'submissionStatus': 'PENDING',
        'variants': <Object>[],
        'media': <Object>[],
      }),
    );

    await fx.openSelling(tester);
    await open(tester, '/selling/products/new');
    await tester.enterText(field('Product name'), 'Aria Earbuds');
    await tester.enterText(field('Your SKU'), 'ARIA-1');
    await tapShown(tester, find.text('Add a photo'));
    await tester.tap(find.widgetWithText(Button, 'Send for review'));
    await tester.pumpAndSettle();

    expect(FakeApi.body(api.calls('POST /sellers/me/products').single), {
      'name': 'Aria Earbuds',
      'slug': 'aria-earbuds',
      'isReturnable': true,
      'returnWindowDays': 14,
    });
    expect(
      FakeApi.body(
        api.calls('POST /sellers/me/products/prod-1/variants').single,
      ),
      {'skuCode': 'ARIA-1'},
    );
    expect(
      FakeApi.body(api.calls('POST /sellers/me/products/prod-1/media').single),
      {'mediaAssetId': 'asset-1', 'position': 0, 'isPrimary': true},
    );
    expect(find.textContaining('With the Commerce team'), findsOneWidget);
  });

  testWidgets('a new listing is found in the catalog, created, then priced', (
    tester,
  ) async {
    final (_, api) = await fx.signedInSeller(
      tester,
      account: fx.seller('APPROVED'),
    );
    api.on(
      'GET /catalog/products',
      (_) => FakeApi.ok({
        'data': [
          {
            'id': 'p-1',
            'name': 'Laptop',
            'variants': [
              {'id': 'v-1', 'skuCode': 'LP-COMP', 'name': 'i7 16GB'},
            ],
          },
        ],
        'meta': {'page': 1, 'limit': 20, 'total': 1},
      }),
    );
    api.on(
      'POST /sellers/me/offers',
      (_) => FakeApi.ok({'id': 'o-9', 'version': 0, 'status': 'DRAFT'}),
    );
    api.on(
      'POST /sellers/me/offers/o-9/prices',
      (_) => FakeApi.ok({'id': 'o-9'}),
    );

    await fx.openSelling(tester);
    await open(tester, '/selling/listings/new');
    await tester.enterText(find.byType(InputField).first, 'Lapt');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Laptop'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Price (K)'), '4,250');
    await tester.tap(find.widgetWithText(Button, 'Create listing'));
    await tester.pumpAndSettle();

    expect(FakeApi.body(api.calls('POST /sellers/me/offers').single), {
      'variantId': 'v-1',
      'listingTitle': 'Laptop i7 16GB',
      'sellerSku': 'LP-COMP',
      'condition': 'NEW',
      'stockSource': 'SELLER',
      'fulfillmentMode': 'SELLER',
    });
    expect(
      FakeApi.body(api.calls('POST /sellers/me/offers/o-9/prices').single),
      {'version': 0, 'amount': 425000, 'currency': 'ZMW'},
    );
  });

  testWidgets('a payout request carries an idempotency key and the amount', (
    tester,
  ) async {
    final (_, api) = await fx.signedInSeller(
      tester,
      account: fx.seller('APPROVED'),
    );
    api.on(
      'GET /sellers/me/payout-accounts',
      (_) => FakeApi.ok([
        {
          'id': 'acct-1',
          'method': 'MOBILE_MONEY',
          'provider': 'MTN',
          'accountHolderName': 'Zawadi',
          'maskedReference': '******4567',
          'status': 'VERIFIED',
          'version': 1,
        },
      ]),
    );
    api.on(
      'GET /sellers/me/payout-requests',
      (_) =>
          FakeApi.ok({'items': <Object>[], 'total': 0, 'page': 1, 'limit': 50}),
    );
    api.on(
      'POST /sellers/me/payout-requests',
      (_) => FakeApi.ok({'id': 'pr-1'}, status: 201),
    );

    await fx.openSelling(tester);
    await open(tester, '/selling/payouts');
    await tester.tap(find.widgetWithText(Button, 'Request a payout'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Amount (K)'), '500');
    await tester.tap(find.widgetWithText(Button, 'Request payout'));
    await tester.pumpAndSettle();

    final request = api.calls('POST /sellers/me/payout-requests').single;
    expect(FakeApi.body(request), {
      'payoutAccountId': 'acct-1',
      'amount': 50000,
    });
    expect(request.headers['Idempotency-Key'], isNotNull);
  });

  testWidgets('a sent shipment takes a tracking update', (tester) async {
    final order = fx.sellerOrder(
      fx.fulfillment(status: 'DISPATCHED', packed: 2, dispatched: 2),
    );
    ((order['shippingGroups']! as List).first as Map)['shipments'] = [
      {
        'id': 'sh-1',
        'status': 'DISPATCHED',
        'carrierCode': 'Postnet',
        'trackingReference': 'PN123',
      },
    ];
    final (_, api) = await fx.signedInSeller(
      tester,
      account: fx.seller('APPROVED'),
      order: () => order,
    );
    api.on(
      'POST /sellers/me/shipments/sh-1/tracking-events',
      (_) => FakeApi.ok({'id': 'sh-1'}),
    );

    await fx.openSelling(tester);
    await open(tester, '/selling/orders/so-1');
    await tester.tap(find.text('Update'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Out for delivery'));
    await tester.pumpAndSettle();
    await tester.enterText(field('Where (optional)'), 'Ndola');
    await tester.tap(find.widgetWithText(Button, 'Post update'));
    await tester.pumpAndSettle();

    final post = api.calls('POST /sellers/me/shipments/sh-1/tracking-events');
    final body = FakeApi.body(post.single);
    expect(body['normalizedStatus'], 'OUT_FOR_DELIVERY');
    expect(body['location'], 'Ndola');
    expect(DateTime.tryParse(body['occurredAt']! as String), isNotNull);
    expect(post.single.headers['Idempotency-Key'], isNotNull);
  });

  testWidgets('shop details save with the account version', (tester) async {
    final (_, api) = await fx.signedInSeller(
      tester,
      account: fx.seller('APPROVED'),
    );
    api.on('PUT /sellers/me/storefront', (_) => FakeApi.ok({'version': 4}));

    await fx.openSelling(tester);
    // The dashboard is a lazy list: scroll until the row is built.
    await tester.scrollUntilVisible(
      find.text('Shop details'),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tapShown(tester, find.text('Shop details'));
    await tester.tap(find.widgetWithText(Button, 'Save'));
    await tester.pumpAndSettle();

    expect(FakeApi.body(api.calls('PUT /sellers/me/storefront').single), {
      'version': 3,
      'storefrontSlug': 'zawadi-dealers-ltd',
      'displayName': 'Zawadi',
      'description': '',
    });
  });
}
