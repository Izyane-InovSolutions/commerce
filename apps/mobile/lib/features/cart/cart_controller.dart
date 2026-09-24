import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../data/catalog_repository.dart';
import '../../data/commerce_repositories.dart';
import '../../domain/cart.dart';
import '../../domain/catalog.dart';
import '../auth/session_controller.dart';

/// The signed-in customer's cart, shared app-wide so the tab badge, product
/// pages and checkout all see the same thing.
///
/// Every mutation returns the server's recomputed cart and that replaces
/// local state wholesale — prices, availability and totals are the API's to
/// decide, never this class's.
class CartController extends ChangeNotifier {
  CartController({
    required CartRepository carts,
    required CatalogRepository catalog,
    required SessionController session,
  })  : _carts = carts,
        _catalog = catalog,
        _session = session {
    _session.addListener(_onSessionChanged);
    _onSessionChanged();
  }

  final CartRepository _carts;
  final CatalogRepository _catalog;
  final SessionController _session;

  Cart _cart = Cart.empty;
  Map<String, OfferDetail> _offers = const {};
  bool _loading = false;
  Object? _error;
  final Set<String> _busyLines = {};
  bool _wasSignedIn = false;

  Cart get cart => _cart;
  int get itemCount => _cart.itemCount;
  bool get isLoading => _loading;
  Object? get error => _error;
  String? get errorMessage => _error == null ? null : describeError(_error!);
  OfferDetail? offerFor(CartLine line) => _offers[line.offerId];
  bool isBusy(CartLine line) => _busyLines.contains(line.id);

  Future<void> refresh() async {
    if (!_session.isSignedIn) return;
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      await _adopt(await _carts.cart());
    } catch (error) {
      _error = error;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  /// Throws on failure so the product page can say why ("out of stock").
  Future<void> add(String offerId, {int quantity = 1}) async {
    await _adopt(await _carts.addItem(offerId, quantity));
    notifyListeners();
  }

  Future<void> setQuantity(CartLine line, int quantity) async {
    if (quantity < 1) return remove(line);
    await _mutating(line, () => _carts.updateItem(line.id, quantity));
  }

  Future<void> remove(CartLine line) =>
      _mutating(line, () => _carts.removeItem(line.id));

  /// Checkout empties the cart server-side; this catches the app up.
  void markCheckedOut() {
    _cart = Cart.empty;
    notifyListeners();
    refresh();
  }

  Future<void> _mutating(CartLine line, Future<Cart> Function() action) async {
    _busyLines.add(line.id);
    notifyListeners();
    try {
      await _adopt(await action());
      _error = null;
    } finally {
      _busyLines.remove(line.id);
      notifyListeners();
    }
  }

  Future<void> _adopt(Cart cart) async {
    _cart = cart;
    final missing =
        cart.items.map((line) => line.offerId).where((id) => !_offers.containsKey(id));
    if (missing.isNotEmpty) {
      _offers = {..._offers, ...await _catalog.offers(missing)};
    }
  }

  void _onSessionChanged() {
    final signedIn = _session.isSignedIn;
    if (signedIn && !_wasSignedIn) {
      refresh();
    } else if (!signedIn && _wasSignedIn) {
      _cart = Cart.empty;
      _error = null;
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
