import 'dart:convert';
import 'dart:io';

import 'package:commerce_mobile/core/network/api_exception.dart';
import 'package:commerce_mobile/core/network/guarded.dart';
import 'package:commerce_mobile/core/network/json.dart';
import 'package:commerce_mobile/domain/catalog.dart';
import 'package:commerce_mobile/domain/orders.dart';
import 'package:flutter_test/flutter_test.dart';

/// Fixtures are real responses captured from the internal-testing API, so
/// these tests fail if the models drift from what the server actually sends.
Json fixture(String name) =>
    jsonDecode(File('test/fixtures/$name.json').readAsStringSync()) as Json;

void main() {
  test('parses a real product page, including its nested pagination', () {
    final page = ProductPage.fromJson(fixture('product_page'));

    expect(page.products, hasLength(2));
    expect(page.total, greaterThan(page.products.length));
    expect(page.hasMore, isTrue);

    final laptop = page.products.first;
    expect(laptop.name, 'Laptop');
    expect(laptop.primaryImage!.url, startsWith('/api/v1/media/'));
    expect(laptop.headlineOffer!.price!.formatted, 'K4,500.00');
    expect(laptop.headlineOffer!.sellerName, 'Sold by Zawadi');
  });

  test('parses a real offer lookup — how cart lines get a name', () {
    final offer = OfferDetail.fromJson(fixture('offer'));
    expect(offer.title, 'Laptop');
    expect(offer.productSlug, 'laptop-computer');
    expect(offer.imageUrl, startsWith('/api/v1/media/'));
    expect(offer.condition, OfferCondition.newItem);
  });

  // From GET /orders/:id, after the sandbox gateway approved the payment.
  // (The checkout response embeds the same order with `payment: null` and
  // carries the payment as a sibling — see CheckoutResult.)
  test('parses a real paid order with its address snapshot and payment', () {
    final order = Order.fromJson(fixture('order'));
    expect(order.status, OrderStatus.paid);
    expect(order.fulfillment, FulfillmentStatus.preparing);
    expect(order.totalMoney.formatted, 'K9,000.00');
    expect(order.itemCount, 2);
    expect(order.reference, hasLength(8));
    expect(order.shippingAddress!.lines.first, 'Plot 12 Cairo Rd');
    expect(order.payment!.status, PaymentStatus.succeeded);
  });

  test('a response missing a required field fails as a readable ApiException',
      () {
    final broken = fixture('offer')..remove('product');
    expect(
      () => parseResponse(() => OfferDetail.fromJson(broken)),
      throwsA(isA<ApiException>()
          .having((e) => e.kind, 'kind', ApiErrorKind.badResponse)),
    );
  });

  test('prefers the image marked primary over position order', () {
    final json = fixture('product_page');
    final product = asJson((json['data']! as List).first);
    product['media'] = [
      {'id': 'a', 'mediaAssetId': 'a', 'position': 0, 'isPrimary': false, 'mimeType': 'image/png', 'url': '/a'},
      {'id': 'b', 'mediaAssetId': 'b', 'position': 1, 'isPrimary': true, 'mimeType': 'image/png', 'url': '/b'},
    ];
    expect(Product.fromJson(product).primaryImage!.url, '/b');
  });

  test('a variant leads with its cheapest purchasable offer', () {
    Json offer(String id, int amount, {bool inStock = true}) => {
          'id': id,
          'inStock': inStock,
          'isFirstParty': false,
          'currentPrice': {'amount': amount, 'currency': 'ZMW'},
        };
    final variant = Variant.fromJson({
      'id': 'v',
      'skuCode': 'SKU',
      'offers': [
        offer('cheap-but-gone', 100, inStock: false),
        offer('dear', 900),
        offer('best', 500),
      ],
    });
    expect(variant.bestOffer!.id, 'best');
  });
}
