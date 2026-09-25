import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../core/storage/key_value_store.dart';
import '../../domain/catalog.dart';
import '../auth/session_controller.dart';

/// Enough of a product to show it in a rail before the API answers.
class ViewedProduct {
  const ViewedProduct({
    required this.slug,
    required this.name,
    this.categorySlug,
    this.imageUrl,
    this.price,
    this.currency,
  });

  factory ViewedProduct.of(Product product) {
    final price = product.headlineOffer?.price;
    return ViewedProduct(
      slug: product.slug,
      name: product.name,
      categorySlug: product.category?.slug,
      imageUrl: product.primaryImage?.url,
      price: price?.amount,
      currency: price?.currency,
    );
  }

  factory ViewedProduct.fromJson(Map<String, Object?> json) => ViewedProduct(
    slug: json['slug']! as String,
    name: json['name']! as String,
    categorySlug: json['category'] as String?,
    imageUrl: json['image'] as String?,
    price: json['price'] as int?,
    currency: json['currency'] as String?,
  );

  final String slug;
  final String name;
  final String? categorySlug;

  /// Signed and short-lived; the Shop screen refreshes it from the API.
  final String? imageUrl;
  final int? price;
  final String? currency;

  Map<String, Object?> toJson() => {
    'slug': slug,
    'name': name,
    'category': categorySlug,
    'image': imageUrl,
    'price': price,
    'currency': currency,
  };
}

/// What this person has looked at and searched for on this phone — the
/// material for "recently viewed", "based on your search" and "more like
/// what you viewed".
///
/// Kept on the device, never sent anywhere, and forgotten on sign-out so a
/// shared phone does not show the next person what the last one browsed.
class BrowsingHistory extends ChangeNotifier {
  BrowsingHistory({required KeyValueStore store, SessionController? session})
    : _store = store,
      _session = session {
    _session?.addListener(_onSession);
    _wasSignedIn = _session?.isSignedIn ?? false;
  }

  static const _viewedKey = 'commerce.history.viewed';
  static const _searchesKey = 'commerce.history.searches';
  static const maxViewed = 20;
  static const maxSearches = 8;

  final KeyValueStore _store;
  final SessionController? _session;
  bool _wasSignedIn = false;

  List<ViewedProduct> _viewed = const [];
  List<String> _searches = const [];

  List<ViewedProduct> get viewed => _viewed;
  List<String> get searches => _searches;

  Future<void> load() async {
    try {
      final viewed = await _store.read(_viewedKey);
      final searches = await _store.read(_searchesKey);
      _viewed = viewed == null
          ? const []
          : (jsonDecode(viewed) as List)
                .map((e) => ViewedProduct.fromJson(e as Map<String, Object?>))
                .toList();
      _searches = searches == null
          ? const []
          : (jsonDecode(searches) as List).cast<String>();
    } catch (_) {
      // Unreadable history is no history, not a crash.
      _viewed = const [];
      _searches = const [];
    }
    notifyListeners();
  }

  void viewedProduct(Product product) {
    _viewed = [
      ViewedProduct.of(product),
      ..._viewed.where((v) => v.slug != product.slug),
    ].take(maxViewed).toList();
    notifyListeners();
    _save();
  }

  /// Records what was searched for. Typing refines a search one letter at a
  /// time, so a query that extends or trims the latest one replaces it
  /// rather than stacking up "lap", "lapt", "laptop".
  void searched(String query) {
    final q = query.trim();
    if (q.length < 3) return;
    final lower = q.toLowerCase();
    final rest = _searches.where((s) => s.toLowerCase() != lower).toList();
    if (rest.isNotEmpty) {
      final latest = rest.first.toLowerCase();
      if (lower.startsWith(latest) || latest.startsWith(lower)) {
        rest.removeAt(0);
      }
    }
    _searches = [q, ...rest].take(maxSearches).toList();
    notifyListeners();
    _save();
  }

  void forgetSearch(String query) {
    _searches = _searches.where((s) => s != query).toList();
    notifyListeners();
    _save();
  }

  Future<void> clear() async {
    _viewed = const [];
    _searches = const [];
    notifyListeners();
    await _store.delete(_viewedKey);
    await _store.delete(_searchesKey);
  }

  Future<void> _save() async {
    try {
      await _store.write(
        _viewedKey,
        jsonEncode([for (final v in _viewed) v.toJson()]),
      );
      await _store.write(_searchesKey, jsonEncode(_searches));
    } catch (_) {
      // Losing history is harmless; failing a page view over it is not.
    }
  }

  void _onSession() {
    final signedIn = _session!.isSignedIn;
    if (_wasSignedIn && !signedIn) clear();
    _wasSignedIn = signedIn;
  }

  @override
  void dispose() {
    _session?.removeListener(_onSession);
    super.dispose();
  }
}
