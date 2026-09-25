import 'dart:convert';

import 'package:commerce_mobile/core/config/api_endpoint.dart';
import 'package:commerce_mobile/core/network/api_client.dart';
import 'package:commerce_mobile/core/storage/key_value_store.dart';
import 'package:commerce_mobile/data/catalog_repository.dart';
import 'package:commerce_mobile/domain/catalog.dart';
import 'package:commerce_mobile/features/catalog/product_filters.dart';
import 'package:commerce_mobile/features/shop/browsing_history.dart';
import 'package:commerce_mobile/features/shop/shop_feed.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../app_smoke_test.dart' show boot;
import '../support/fake_api.dart';

Map<String, Object?> offer(
  String id, {
  required int price,
  String seller = 's-1',
  String sellerName = 'Zawadi',
  bool inStock = true,
  int? shipping,
}) => {
  'id': id,
  'isFirstParty': false,
  'inStock': inStock,
  'seller': {
    'id': seller,
    'storefrontSlug': sellerName.toLowerCase(),
    'displayName': sellerName,
  },
  'currentPrice': {'amount': price, 'currency': 'ZMW'},
  'shippingCost': shipping == null
      ? null
      : {'amount': shipping, 'currency': 'ZMW'},
};

Map<String, Object?> product(
  String slug, {
  required List<Map<String, Object?>> offers,
  double? rating,
  int ratings = 0,
  String category = 'electronics',
  bool returnable = true,
}) => {
  'id': 'id-$slug',
  'name': slug,
  'slug': slug,
  'isReturnable': returnable,
  'averageRating': rating,
  'ratingCount': ratings,
  'category': {'id': 'c-$category', 'name': category, 'slug': category},
  'media': [
    {
      'id': 'm-$slug',
      'url': '/api/v1/media/$slug.png',
      'position': 0,
      'isPrimary': true,
    },
  ],
  'variants': [
    {'id': 'v-$slug', 'skuCode': slug, 'offers': offers},
  ],
};

Product parse(Map<String, Object?> json) =>
    Product.fromJson(jsonDecode(jsonEncode(json)) as Map<String, Object?>);

void main() {
  group('filters', () {
    final cheap = parse(product('cheap', offers: [offer('o1', price: 30000)]));
    final dear = parse(
      product(
        'dear',
        offers: [offer('o2', price: 500000)],
        rating: 4.6,
        ratings: 9,
      ),
    );
    final free = parse(
      product('free', offers: [offer('o3', price: 90000, shipping: 0)]),
    );
    final gone = parse(
      product('gone', offers: [offer('o4', price: 40000, inStock: false)]),
    );
    final all = [cheap, dear, free, gone];

    test('price bands, stock, delivery and rating narrow the list', () {
      String names(ProductFilters f) =>
          f.apply(all).map((p) => p.slug).join(',');
      expect(
        names(const ProductFilters(price: PriceBand.under500)),
        'cheap,gone',
      );
      expect(
        names(
          const ProductFilters(price: PriceBand.under500, inStockOnly: true),
        ),
        'cheap',
      );
      expect(names(const ProductFilters(freeDelivery: true)), 'free');
      expect(names(const ProductFilters(minRating: 4)), 'dear');
    });

    test('sorts by price on the phone, which the API cannot', () {
      String names(LocalSort s) =>
          ProductFilters(sort: s).apply(all).map((p) => p.slug).join(',');
      expect(names(LocalSort.priceLow), 'cheap,gone,free,dear');
      expect(names(LocalSort.priceHigh), 'dear,free,gone,cheap');
      expect(names(LocalSort.rating).split(',').first, 'dear');
    });

    test('an unknown delivery charge is not called free', () {
      expect(hasFreeDelivery(cheap), isFalse);
      expect(hasFreeDelivery(free), isTrue);
    });
  });

  group('browsing history', () {
    test('keeps searches refined by typing as one entry', () {
      final history = BrowsingHistory(store: MemoryKeyValueStore());
      history
        ..searched('lap')
        ..searched('lapt')
        ..searched('laptop')
        ..searched('earbuds')
        ..searched('laptop');
      expect(history.searches, ['laptop', 'earbuds']);
    });

    test(
      'remembers views newest first, once each, and survives restarts',
      () async {
        final store = MemoryKeyValueStore();
        final history = BrowsingHistory(store: store);
        final a = parse(product('a', offers: [offer('o1', price: 100)]));
        final b = parse(product('b', offers: [offer('o2', price: 200)]));
        history
          ..viewedProduct(a)
          ..viewedProduct(b)
          ..viewedProduct(a);
        await Future<void>.delayed(Duration.zero);
        expect(history.viewed.map((v) => v.slug), ['a', 'b']);

        final again = BrowsingHistory(store: store);
        await again.load();
        expect(again.viewed.map((v) => v.slug), ['a', 'b']);
        expect(again.viewed.first.price, 100);
      },
    );
  });

  group('shop feed', () {
    late FakeApi api;
    late ShopFeed feed;

    setUp(() async {
      api = FakeApi();
      api.on(
        'GET /catalog/products',
        (_) => FakeApi.ok({
          'data': [
            // Two sellers: Mwila asks K200 less than Zawadi.
            product(
              'laptop',
              offers: [
                offer('o1', price: 450000),
                offer('o2', price: 430000, seller: 's-2', sellerName: 'Mwila'),
              ],
            ),
            product(
              'earbuds',
              offers: [offer('o3', price: 22000, shipping: 0)],
              rating: 4.8,
              ratings: 12,
            ),
            product(
              'lamp',
              category: 'home',
              offers: [offer('o4', price: 60000)],
            ),
          ],
          'meta': {'page': 1, 'limit': 60, 'total': 3},
        }),
      );
      api.on(
        'GET /catalog/categories',
        (_) => FakeApi.ok([
          {'id': 'c-electronics', 'name': 'Electronics', 'slug': 'electronics'},
          {'id': 'c-home', 'name': 'Home', 'slug': 'home'},
          {'id': 'c-empty', 'name': 'Garden', 'slug': 'garden'},
        ]),
      );
      api.on(
        'GET /storefronts/zawadi',
        (_) => FakeApi.ok({
          'id': 's-1',
          'storefrontSlug': 'zawadi',
          'displayName': 'Zawadi',
          'averageRating': 4.2,
          'ratingCount': 5,
        }),
      );
      api.on(
        'GET /storefronts/mwila',
        (_) => FakeApi.ok({
          'id': 's-2',
          'storefrontSlug': 'mwila',
          'displayName': 'Mwila',
          'averageRating': null,
          'ratingCount': 0,
        }),
      );
      final client = ApiClient(
        endpoint: ApiEndpoint.fixed(
          Uri.parse('https://api.example.test/api/v1'),
        ),
        httpClient: api.client,
        retryDelays: const [],
      );
      feed = ShopFeed(
        catalog: CatalogRepository(client),
        history: BrowsingHistory(store: MemoryKeyValueStore()),
      );
      await feed.load();
    });

    test(
      'deals are real: a lower price than another seller, or free delivery',
      () {
        expect(feed.deals.map((d) => (d.product.slug, d.note)), [
          ('laptop', 'K200 below others'),
          ('earbuds', 'Free delivery'),
        ]);
      },
    );

    test('rated sellers lead, then the one with the lowest prices', () {
      expect(feed.sellers.map((s) => s.name), ['Zawadi', 'Mwila']);
      expect(feed.sellers.last.bestPrices, 1);
    });

    test('categories carry a photo from inside them, busiest first', () {
      expect(feed.categories.first.category.slug, 'electronics');
      expect(feed.categories.first.cover, '/api/v1/media/laptop.png');
      expect(
        feed.categories.firstWhere((c) => c.category.slug == 'garden').cover,
        isNull,
      );
    });

    test('top rated and under K500 draw on real ratings and prices', () {
      expect(feed.topRated.single.product.slug, 'earbuds');
      expect(feed.underFiveHundred.map((p) => p.product.slug), ['earbuds']);
    });
  });

  testWidgets('viewing a product puts it in Recently viewed on Shop', (
    tester,
  ) async {
    await boot(tester);
    expect(find.text('Recently viewed'), findsNothing);

    await tester.ensureVisible(find.text('Laptop').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Laptop').first);
    await tester.pumpAndSettle();
    await tester.tap(find.bySemanticsLabel('Back').last);
    await tester.pump(const Duration(seconds: 1));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Recently viewed'),
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Recently viewed'), findsOneWidget);
  });
}
