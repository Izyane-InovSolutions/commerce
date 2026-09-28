import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../data/catalog_repository.dart';
import '../../domain/catalog.dart';
import 'product_filters.dart';

/// A paged, filterable product listing.
class ProductListController extends ChangeNotifier {
  ProductListController(
    this._catalog, {
    ProductQuery query = const ProductQuery(),
    ProductFilters filters = ProductFilters.none,
  }) : _query = query,
       _filters = filters;

  final CatalogRepository _catalog;
  static const pageSize = 20;

  /// How far the list reads ahead to satisfy filters the API cannot apply.
  /// Past this, what is shown is "matches among the first 200".
  static const filterReach = 200;

  ProductQuery _query;
  ProductFilters _filters;
  List<Product> _products = const [];
  int _page = 0;
  int _total = 0;
  bool _loading = false;
  bool _loadingMore = false;
  bool _hasMore = true;
  Object? _error;
  bool _disposed = false;

  /// Bumped on every new query. A response for an older query — say, the
  /// search box two keystrokes ago — is dropped instead of overwriting the
  /// results for what is typed now.
  int _generation = 0;

  ProductQuery get query => _query;
  ProductFilters get filters => _filters;

  /// What to show: the loaded results, filtered and sorted on the phone.
  List<Product> get products =>
      _filters.isActive ? _filters.apply(_products) : _products;

  /// How many the API has for the query, before phone-side filters.
  int get total => _total;

  /// How many results have been read so far.
  int get loadedCount => _products.length;

  /// True when phone-side filters could only look at part of the results.
  bool get filteredPartially =>
      _filters.isActive && _hasMore && _products.length >= filterReach;

  /// Applies phone-side filters, reading further pages until every result
  /// the API has (up to [filterReach]) has been checked.
  Future<void> setFilters(ProductFilters filters) async {
    _filters = filters;
    _notify();
    await _readAhead();
  }

  Future<void> _readAhead() async {
    while (_filters.isActive &&
        _hasMore &&
        _error == null &&
        _products.length < filterReach) {
      final before = _products.length;
      await loadMore();
      if (_products.length == before) break;
    }
  }

  bool get isLoading => _loading;
  bool get isLoadingMore => _loadingMore;
  bool get hasMore => _hasMore;
  bool get hasLoaded => _page > 0;
  String? get errorMessage => _error == null ? null : describeError(_error!);
  String? get requestId =>
      _error is ApiException ? (_error! as ApiException).requestId : null;

  Future<void> load([ProductQuery? query]) async {
    if (query != null) _query = query;
    final generation = ++_generation;
    _loading = true;
    _error = null;
    _notify();
    try {
      final page = await _catalog.products(_query, page: 1, limit: pageSize);
      if (generation != _generation) return;
      _products = page.products;
      _page = 1;
      _total = page.total;
      _hasMore = page.hasMore;
    } catch (error) {
      if (generation != _generation) return;
      _error = error;
    } finally {
      if (generation == _generation) {
        _loading = false;
        _notify();
      }
    }
    if (generation == _generation) await _readAhead();
  }

  Future<void> loadMore() async {
    if (_loading || _loadingMore || !_hasMore || _error != null) return;
    final generation = _generation;
    _loadingMore = true;
    _notify();
    try {
      final page = await _catalog.products(
        _query,
        page: _page + 1,
        limit: pageSize,
      );
      if (generation != _generation) return;
      final seen = _products.map((p) => p.id).toSet();
      final fresh = page.products.where((p) => !seen.contains(p.id)).toList();
      _products = [..._products, ...fresh];
      _page = page.page > _page ? page.page : _page + 1;
      _total = page.total;
      // Stop when a page brings nothing new, whatever `total` claims. Items
      // added while paging shift everything along, so a page can come back
      // holding only products already shown — and the grid asks for the next
      // page every time it builds its last few cards. Without this, that is
      // an endless request loop against a rate-limited API.
      _hasMore = page.hasMore && fresh.isNotEmpty;
    } catch (_) {
      // Leave what is shown; the next scroll to the end tries again.
    } finally {
      if (generation == _generation) {
        _loadingMore = false;
        _notify();
      }
    }
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
