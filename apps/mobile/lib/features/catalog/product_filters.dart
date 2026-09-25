import '../../domain/catalog.dart';

/// Price bands in kwacha, in minor units. Bands rather than a slider: on a
/// phone, picking "K500–2,000" is one tap and says exactly what it does.
enum PriceBand {
  any(null, null, 'Any price'),
  under500(null, 50000, 'Under K500'),
  to2000(50000, 200000, 'K500 to K2,000'),
  to10000(200000, 1000000, 'K2,000 to K10,000'),
  over10000(1000000, null, 'Over K10,000');

  const PriceBand(this.min, this.max, this.label);

  final int? min;
  final int? max;
  final String label;

  bool contains(int amount) =>
      (min == null || amount >= min!) && (max == null || amount < max!);
}

/// Orders the API cannot do. It accepts `price:asc` but ignores it, so these
/// sort what has been loaded, on the phone.
enum LocalSort {
  priceLow('Price: low to high'),
  priceHigh('Price: high to low'),
  rating('Best rated');

  const LocalSort(this.label);

  final String label;
}

/// Filters applied to results on the phone. The API filters by search,
/// category and brand; everything here it does not, so the list loads
/// further pages to find matches (see `ProductListController`).
class ProductFilters {
  const ProductFilters({
    this.price = PriceBand.any,
    this.minRating,
    this.inStockOnly = false,
    this.freeDelivery = false,
    this.returnable = false,
    this.sort,
    this.sellerId,
  });

  final PriceBand price;

  /// Stars, 1–5; null for any.
  final int? minRating;
  final bool inStockOnly;
  final bool freeDelivery;
  final bool returnable;
  final LocalSort? sort;

  /// Only products this seller sells. For a seller's shop page: the API
  /// cannot list products by seller, only search by their name, so the
  /// search results are narrowed to theirs here.
  final String? sellerId;

  static const none = ProductFilters();

  int get activeCount =>
      (price != PriceBand.any ? 1 : 0) +
      (minRating != null ? 1 : 0) +
      (inStockOnly ? 1 : 0) +
      (freeDelivery ? 1 : 0) +
      (returnable ? 1 : 0);

  bool get isActive => activeCount > 0 || sort != null || sellerId != null;

  ProductFilters copyWith({
    PriceBand? price,
    int? Function()? minRating,
    bool? inStockOnly,
    bool? freeDelivery,
    bool? returnable,
    LocalSort? Function()? sort,
  }) => ProductFilters(
    price: price ?? this.price,
    minRating: minRating == null ? this.minRating : minRating(),
    inStockOnly: inStockOnly ?? this.inStockOnly,
    freeDelivery: freeDelivery ?? this.freeDelivery,
    returnable: returnable ?? this.returnable,
    sort: sort == null ? this.sort : sort(),
    sellerId: sellerId,
  );

  bool matches(Product product) {
    if (sellerId != null &&
        !product.variants.any(
          (v) => v.offers.any((o) => o.seller?.id == sellerId),
        )) {
      return false;
    }
    final offer = product.headlineOffer;
    final price = offer?.price;
    if (this.price != PriceBand.any &&
        (price == null || !this.price.contains(price.amount))) {
      return false;
    }
    if (minRating != null &&
        (product.ratingCount == 0 ||
            (product.averageRating ?? 0) < minRating!)) {
      return false;
    }
    if (inStockOnly && !(offer?.isPurchasable ?? false)) return false;
    if (freeDelivery && !hasFreeDelivery(product)) return false;
    if (returnable && !product.isReturnable) return false;
    return true;
  }

  List<Product> apply(List<Product> products) {
    final kept = products.where(matches).toList();
    int priceOf(Product p) => p.headlineOffer?.price?.amount ?? 1 << 62;
    switch (sort) {
      case LocalSort.priceLow:
        kept.sort((a, b) => priceOf(a).compareTo(priceOf(b)));
      case LocalSort.priceHigh:
        // Unpriced last either way.
        kept.sort((a, b) {
          final pa = a.headlineOffer?.price?.amount ?? -1;
          final pb = b.headlineOffer?.price?.amount ?? -1;
          return pb.compareTo(pa);
        });
      case LocalSort.rating:
        kept.sort((a, b) {
          final byRating = (b.averageRating ?? 0).compareTo(
            a.averageRating ?? 0,
          );
          return byRating != 0
              ? byRating
              : b.ratingCount.compareTo(a.ratingCount);
        });
      case null:
        break;
    }
    return kept;
  }
}

/// A delivery charge the listing states as zero. No charge given means the
/// standard rate applies at checkout — not that delivery is free.
bool hasFreeDelivery(Product product) =>
    product.headlineOffer?.shippingCost?.amount == 0;
