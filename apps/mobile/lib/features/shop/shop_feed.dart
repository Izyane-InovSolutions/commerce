import 'package:flutter/foundation.dart' show ChangeNotifier;

import '../../data/catalog_repository.dart';
import '../../domain/catalog.dart';
import '../catalog/product_filters.dart';
import 'browsing_history.dart';

/// A product shown for a reason, and the reason in a few words.
class Pick {
  const Pick(this.product, [this.note]);

  final Product product;
  final String? note;
}

/// A seller worth a look, and why.
class SellerPick {
  const SellerPick({
    required this.seller,
    required this.listings,
    required this.bestPrices,
    this.storefront,
    this.cover,
  });

  final SellerSummary seller;
  final Storefront? storefront;

  /// Products of theirs among those loaded.
  final int listings;

  /// How many of those they sell for less than every other seller.
  final int bestPrices;

  /// One of their product images, to put a face on the card.
  final String? cover;

  String get name => storefront?.name ?? seller.displayName ?? 'Seller';
  String? get slug => storefront?.slug ?? seller.slug;
  double? get rating =>
      (storefront?.ratingCount ?? 0) > 0 ? storefront!.averageRating : null;
  int get ratingCount => storefront?.ratingCount ?? 0;
}

class CategoryPick {
  const CategoryPick(this.category, {this.cover, this.count = 0});

  final Category category;
  final String? cover;
  final int count;
}

/// The Shop screen's rails, worked out from what the API offers.
///
/// There is no recommendations or promotions service behind the API, so
/// every rail here is computed from real listings and this phone's own
/// history — and says why each thing is on it. "Deals" are products sold for
/// less than another seller's price, or with free delivery; not invented
/// discounts.
class ShopFeed extends ChangeNotifier {
  ShopFeed({
    required CatalogRepository catalog,
    required BrowsingHistory history,
  }) : _catalog = catalog,
       _history = history;

  final CatalogRepository _catalog;
  final BrowsingHistory _history;

  /// How much of the catalog the rails draw on: the newest listings.
  static const poolSize = 60;
  static const railLength = 12;

  List<Product> _pool = const [];
  List<Category> _categories = const [];
  List<Product> _viewed = const [];
  List<Product> _fromSearch = const [];
  List<Product> _moreLikeViewed = const [];
  List<SellerPick> _sellers = const [];
  bool _loading = false;
  bool _loaded = false;
  Object? _error;
  bool _disposed = false;

  bool get isLoading => _loading;
  bool get hasLoaded => _loaded;
  Object? get error => _error;

  String? get lastSearch => _history.searches.firstOrNull;

  /// Recently viewed, freshest data first where it could be fetched, the
  /// stored snapshot otherwise.
  List<ViewedProduct> get viewedSnapshots => _history.viewed;
  List<Product> get viewed => _viewed;
  List<Product> get fromSearch => _fromSearch;
  List<Product> get moreLikeViewed => _moreLikeViewed;
  List<SellerPick> get sellers => _sellers;

  List<Pick> deals = const [];
  List<Pick> topRated = const [];
  List<Pick> underFiveHundred = const [];
  List<CategoryPick> categories = const [];

  Future<void> load() async {
    _loading = true;
    _error = null;
    _notify();
    try {
      final pageRequest = _catalog.products(
        const ProductQuery(),
        limit: poolSize,
      );
      // Its failure is handled where it starts: if the products request
      // fails first, nobody would be waiting on this one to catch it.
      final categoriesRequest = _catalog.categories().catchError(
        (_) => const <Category>[],
      );
      final page = await pageRequest;
      final categories = await categoriesRequest;
      _pool = page.products;
      _categories = categories;
      _compute();
      _loaded = true;
    } catch (error) {
      _error = error;
    }
    _notify();
    // The personal rails and seller ratings follow; each may fail alone.
    await Future.wait([
      _loadViewed(),
      _loadFromSearch(),
      _loadMoreLikeViewed(),
      _loadSellers(),
    ]);
    _loading = false;
    _notify();
  }

  /// Re-reads only what depends on this phone's history — after a product
  /// is viewed or a search made — leaving the catalog-wide rails alone, so
  /// browsing does not re-download the whole shop each time.
  Future<void> refreshPersonal() async {
    if (!_loaded) return;
    _compute();
    await Future.wait([
      _loadViewed(),
      _loadFromSearch(),
      _loadMoreLikeViewed(),
    ]);
    _notify();
  }

  void _compute() {
    final viewedCategories = _history.viewed
        .map((v) => v.categorySlug)
        .whereType<String>()
        .toSet();

    // Deals: sold for less than another seller's price, or free delivery.
    final deals = <(Pick, int)>[];
    for (final p in _pool) {
      final saving = _saving(p);
      if (saving > 0) {
        deals.add((Pick(p, '${_short(saving)} below others'), saving));
      } else if (hasFreeDelivery(p) && (p.headlineOffer?.inStock ?? false)) {
        deals.add((Pick(p, 'Free delivery'), 0));
      }
    }
    // Biggest saving first; things in categories they browse break ties.
    int affinity(Product p) =>
        viewedCategories.contains(p.category?.slug) ? 1 : 0;
    deals.sort((a, b) {
      final bySaving = b.$2.compareTo(a.$2);
      return bySaving != 0
          ? bySaving
          : affinity(b.$1.product) - affinity(a.$1.product);
    });
    this.deals = deals.map((d) => d.$1).take(railLength).toList();

    topRated =
        (_pool
                .where(
                  (p) => p.ratingCount > 0 && (p.averageRating ?? 0) >= 3.5,
                )
                .toList()
              ..sort((a, b) {
                final r = (b.averageRating ?? 0).compareTo(
                  a.averageRating ?? 0,
                );
                return r != 0 ? r : b.ratingCount.compareTo(a.ratingCount);
              }))
            .take(railLength)
            .map(Pick.new)
            .toList();

    underFiveHundred =
        (_pool
                .where(
                  (p) =>
                      (p.headlineOffer?.isPurchasable ?? false) &&
                      PriceBand.under500.contains(
                        p.headlineOffer!.price!.amount,
                      ),
                )
                .toList()
              ..sort(
                (a, b) => a.headlineOffer!.price!.amount.compareTo(
                  b.headlineOffer!.price!.amount,
                ),
              ))
            .take(railLength)
            .map(Pick.new)
            .toList();

    // Categories: the top level, each with a product photo from inside it.
    final parents = {for (final c in _categories) c.id: c.parentId};
    String? topOf(Category? c) {
      var id = c?.id;
      // The product carries its category's parent even when the category
      // list does not know the category itself.
      var parent = parents[id] ?? c?.parentId;
      while (parent != null) {
        id = parent;
        parent = parents[id];
      }
      return id;
    }

    final byTop = <String, List<Product>>{};
    for (final p in _pool) {
      final top = topOf(p.category);
      if (top != null) byTop.putIfAbsent(top, () => []).add(p);
    }
    categories = [
      for (final c in _categories.where((c) => c.parentId == null))
        CategoryPick(
          c,
          cover: byTop[c.id]
              ?.map((p) => p.primaryImage?.url)
              .whereType<String>()
              .firstOrNull,
          count: byTop[c.id]?.length ?? 0,
        ),
    ]..sort((a, b) => b.count.compareTo(a.count));
  }

  /// How much less the cheapest seller asks than the next one, for the
  /// product's headline variant; 0 with one seller.
  static int _saving(Product p) {
    for (final variant in p.variants) {
      final prices =
          variant.offers
              .where((o) => o.isPurchasable)
              .map((o) => o.price!.amount)
              .toList()
            ..sort();
      if (prices.length >= 2) return prices[1] - prices[0];
    }
    return 0;
  }

  static String _short(int minor) {
    final whole = (minor / 100).round();
    return 'K$whole';
  }

  Future<void> _loadViewed() async {
    final wanted = _history.viewed.take(8).toList();
    if (wanted.isEmpty) {
      _viewed = const [];
      return;
    }
    final inPool = {for (final p in _pool) p.slug: p};
    final fetched = await Future.wait(
      wanted.map((v) async {
        final known = inPool[v.slug];
        if (known != null) return known;
        try {
          return await _catalog.product(v.slug);
        } catch (_) {
          return null;
        }
      }),
    );
    _viewed = fetched.whereType<Product>().toList();
  }

  Future<void> _loadFromSearch() async {
    final query = lastSearch;
    if (query == null) {
      _fromSearch = const [];
      return;
    }
    try {
      final page = await _catalog.products(
        ProductQuery(search: query),
        limit: railLength,
      );
      _fromSearch = page.products;
    } catch (_) {
      _fromSearch = const [];
    }
  }

  /// Other products from the categories most recently looked at.
  Future<void> _loadMoreLikeViewed() async {
    final seen = _history.viewed.map((v) => v.slug).toSet();
    final category = _history.viewed
        .map((v) => v.categorySlug)
        .whereType<String>()
        .firstOrNull;
    if (category == null) {
      _moreLikeViewed = const [];
      return;
    }
    try {
      final page = await _catalog.products(
        ProductQuery(categorySlug: category),
        limit: railLength + seen.length,
      );
      _moreLikeViewed = page.products
          .where((p) => !seen.contains(p.slug))
          .take(railLength)
          .toList();
    } catch (_) {
      _moreLikeViewed = const [];
    }
  }

  /// Sellers ranked by what customers say of them, then by how often they
  /// have the lowest price, then by how much they sell.
  Future<void> _loadSellers() async {
    final tally =
        <
          String,
          ({SellerSummary seller, int listings, int best, String? cover})
        >{};
    for (final p in _pool) {
      final cheapest = p.headlineOffer;
      final multiple = _saving(p) > 0;
      final counted = <String>{};
      for (final v in p.variants) {
        for (final o in v.offers) {
          final s = o.seller;
          if (s == null || s.slug == null || counted.contains(s.id)) continue;
          counted.add(s.id);
          final t = tally[s.id];
          final best = multiple && identical(o, cheapest) ? 1 : 0;
          tally[s.id] = (
            seller: s,
            listings: (t?.listings ?? 0) + 1,
            best: (t?.best ?? 0) + best,
            cover: t?.cover ?? p.primaryImage?.url,
          );
        }
      }
    }
    final candidates = tally.values.toList()
      ..sort((a, b) => b.listings.compareTo(a.listings));
    final picks = await Future.wait(
      candidates.take(8).map((t) async {
        Storefront? storefront;
        try {
          storefront = await _catalog.storefront(t.seller.slug!);
        } catch (_) {}
        return SellerPick(
          seller: t.seller,
          storefront: storefront,
          listings: t.listings,
          bestPrices: t.best,
          cover: t.cover,
        );
      }),
    );
    picks.sort((a, b) {
      final r = (b.rating ?? 0).compareTo(a.rating ?? 0);
      if (r != 0) return r;
      final p = b.bestPrices.compareTo(a.bestPrices);
      return p != 0 ? p : b.listings.compareTo(a.listings);
    });
    _sellers = picks;
  }

  void _notify() {
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
