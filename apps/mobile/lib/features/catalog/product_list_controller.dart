import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../data/catalog_repository.dart';
import '../../domain/catalog.dart';

/// A paged, filterable product listing.
class ProductListController extends ChangeNotifier {
  ProductListController(this._catalog, {ProductQuery query = const ProductQuery()})
      : _query = query;

  final CatalogRepository _catalog;
  static const pageSize = 20;

  ProductQuery _query;
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
  List<Product> get products => _products;
  int get total => _total;
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
  }

  Future<void> loadMore() async {
    if (_loading || _loadingMore || !_hasMore || _error != null) return;
    final generation = _generation;
    _loadingMore = true;
    _notify();
    try {
      final page =
          await _catalog.products(_query, page: _page + 1, limit: pageSize);
      if (generation != _generation) return;
      final seen = _products.map((p) => p.id).toSet();
      final fresh =
          page.products.where((p) => !seen.contains(p.id)).toList();
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
