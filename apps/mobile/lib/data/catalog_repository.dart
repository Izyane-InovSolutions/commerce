import '../core/config/app_config.dart';
import '../core/network/api_client.dart';
import '../core/network/guarded.dart';
import '../core/network/json.dart';
import '../domain/catalog.dart';

/// The sort orders the API actually honours.
///
/// It also *accepts* `price:asc`/`price:desc` but silently ignores them and
/// returns newest-first, so price sorting is deliberately not offered: a sort
/// control that does not sort is worse than none.
enum ProductSort {
  newest('createdAt:desc', 'Newest'),
  nameAsc('name:asc', 'Name A–Z'),
  nameDesc('name:desc', 'Name Z–A');

  const ProductSort(this.wireValue, this.label);

  final String wireValue;
  final String label;
}

class ProductQuery {
  const ProductQuery({
    this.search,
    this.categorySlug,
    this.brandSlug,
    this.sort = ProductSort.newest,
  });

  final String? search;
  final String? categorySlug;
  final String? brandSlug;
  final ProductSort sort;

  ProductQuery copyWith({
    String? search,
    String? Function()? categorySlug,
    String? Function()? brandSlug,
    ProductSort? sort,
  }) =>
      ProductQuery(
        search: search ?? this.search,
        categorySlug: categorySlug == null ? this.categorySlug : categorySlug(),
        brandSlug: brandSlug == null ? this.brandSlug : brandSlug(),
        sort: sort ?? this.sort,
      );

  @override
  bool operator ==(Object other) =>
      other is ProductQuery &&
      other.search == search &&
      other.categorySlug == categorySlug &&
      other.brandSlug == brandSlug &&
      other.sort == sort;

  @override
  int get hashCode => Object.hash(search, categorySlug, brandSlug, sort);
}

class CatalogRepository {
  CatalogRepository(this._api);

  final ApiClient _api;

  /// Offers are looked up once per line of every cart, wishlist and order.
  /// Caching them keeps a ten-line cart from costing ten requests on every
  /// visit — which matters against a 100-requests-a-minute rate limit.
  final Map<String, Future<OfferDetail>> _offers = {};

  void clearCache() => _offers.clear();

  Future<List<Category>> categories() async {
    final data = await _api.get('/catalog/categories', authenticated: false);
    return parseResponse(() => listOf(data, Category.fromJson, 'categories'));
  }

  Future<List<Brand>> brands() async {
    final data = await _api.get('/catalog/brands', authenticated: false);
    return parseResponse(() => listOf(data, Brand.fromJson, 'brands'));
  }

  Future<ProductPage> products(
    ProductQuery query, {
    int page = 1,
    int limit = 20,
  }) async {
    final data = await _api.get(
      '/catalog/products',
      authenticated: false,
      query: {
        'page': page,
        'limit': limit,
        'sort': query.sort.wireValue,
        'currency': AppConfig.currency,
        'q': query.search?.trim(),
        'categorySlug': query.categorySlug,
        'brandSlug': query.brandSlug,
      },
    );
    return parseResponse(() => ProductPage.fromJson(asJson(data)));
  }

  Future<Product> product(String slug) async {
    final data = await _api.get(
      '/catalog/products/${Uri.encodeComponent(slug)}',
      authenticated: false,
      query: {'currency': AppConfig.currency},
    );
    return parseResponse(() => Product.fromJson(asJson(data)));
  }

  Future<OfferDetail> offer(String id) {
    return _offers.putIfAbsent(id, () async {
      try {
        final data = await _api.get(
          '/catalog/offers/${Uri.encodeComponent(id)}',
          authenticated: false,
          query: {'currency': AppConfig.currency},
        );
        return parseResponse<OfferDetail>(
            () => OfferDetail.fromJson(asJson(data)));
      } catch (_) {
        // Do not cache a failure: the next screen to ask should retry.
        _offers.remove(id);
        rethrow;
      }
    });
  }

  /// Resolves many offers, tolerating individual failures — a single
  /// unpublished listing should not blank out a whole cart.
  Future<Map<String, OfferDetail>> offers(Iterable<String> ids) async {
    final unique = ids.toSet();
    final entries = await Future.wait(unique.map((id) async {
      try {
        return MapEntry(id, await offer(id));
      } catch (_) {
        return null;
      }
    }));
    return {for (final entry in entries.whereType<MapEntry<String, OfferDetail>>()) entry.key: entry.value};
  }
}
