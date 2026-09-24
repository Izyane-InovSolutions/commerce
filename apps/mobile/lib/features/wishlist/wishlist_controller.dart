import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../data/catalog_repository.dart';
import '../../data/commerce_repositories.dart';
import '../../domain/cart.dart';
import '../../domain/catalog.dart';
import '../auth/session_controller.dart';

/// Saved offers, shared app-wide so a heart on any product page reflects it.
class WishlistController extends ChangeNotifier {
  WishlistController({
    required WishlistRepository wishlist,
    required CatalogRepository catalog,
    required SessionController session,
  })  : _wishlist = wishlist,
        _catalog = catalog,
        _session = session {
    _session.addListener(_onSessionChanged);
    _onSessionChanged();
  }

  final WishlistRepository _wishlist;
  final CatalogRepository _catalog;
  final SessionController _session;

  List<WishlistItem> _items = const [];
  Map<String, OfferDetail> _offers = const {};
  final Set<String> _pending = {};
  bool _loading = false;
  Object? _error;
  bool _wasSignedIn = false;

  List<WishlistItem> get items => _items;
  bool get isLoading => _loading;
  String? get errorMessage => _error == null ? null : describeError(_error!);
  OfferDetail? offerFor(WishlistItem item) => _offers[item.offerId];
  bool contains(String offerId) =>
      _items.any((item) => item.offerId == offerId);
  bool isPending(String offerId) => _pending.contains(offerId);

  Future<void> refresh() async {
    if (!_session.isSignedIn) return;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final items = await _wishlist.list();
      _offers = {..._offers, ...await _catalog.offers(items.map((i) => i.offerId))};
      _items = items;
    } catch (error) {
      _error = error;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Throws on failure so the caller can show why.
  Future<void> toggle(String offerId) async {
    if (_pending.contains(offerId)) return;
    _pending.add(offerId);
    notifyListeners();
    try {
      if (contains(offerId)) {
        await _wishlist.remove(offerId);
      } else {
        await _wishlist.add(offerId);
      }
      // Re-read rather than patch locally: the server decides what the
      // saved line looks like (its price, its availability).
      final items = await _wishlist.list();
      _offers = {..._offers, ...await _catalog.offers(items.map((i) => i.offerId))};
      _items = items;
    } finally {
      _pending.remove(offerId);
      notifyListeners();
    }
  }

  void _onSessionChanged() {
    final signedIn = _session.isSignedIn;
    if (signedIn && !_wasSignedIn) {
      refresh();
    } else if (!signedIn && _wasSignedIn) {
      _items = const [];
      notifyListeners();
    }
    _wasSignedIn = signedIn;
  }

  @override
  void dispose() {
    _session.removeListener(_onSessionChanged);
    super.dispose();
  }
}
