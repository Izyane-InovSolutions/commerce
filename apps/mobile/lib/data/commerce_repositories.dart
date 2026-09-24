import '../core/config/app_config.dart';
import '../core/network/api_client.dart';
import '../core/network/guarded.dart';
import '../core/network/json.dart';
import '../domain/account.dart';
import '../domain/auth.dart';
import '../domain/cart.dart';
import '../domain/checkout.dart';
import '../domain/orders.dart';

class CartRepository {
  const CartRepository(this._api);

  final ApiClient _api;
  static const _currency = {'currency': AppConfig.currency};

  Future<Cart> cart() async {
    final data = await _api.get('/cart', query: _currency);
    return parseResponse(() => Cart.fromJson(asJson(data)));
  }

  Future<Cart> addItem(String offerId, int quantity) async {
    final data = await _api.post(
      '/cart/items',
      query: _currency,
      body: {'offerId': offerId, 'quantity': quantity},
    );
    return parseResponse(() => Cart.fromJson(asJson(data)));
  }

  Future<Cart> updateItem(String itemId, int quantity) async {
    final data = await _api.patch(
      '/cart/items/${Uri.encodeComponent(itemId)}',
      query: _currency,
      body: {'quantity': quantity},
    );
    return parseResponse(() => Cart.fromJson(asJson(data)));
  }

  Future<Cart> removeItem(String itemId) async {
    final data = await _api.delete(
      '/cart/items/${Uri.encodeComponent(itemId)}',
      query: _currency,
    );
    return data == null
        ? cart()
        : parseResponse(() => Cart.fromJson(asJson(data)));
  }
}

class WishlistRepository {
  const WishlistRepository(this._api);

  final ApiClient _api;

  Future<List<WishlistItem>> list() async {
    final data = await _api.get(
      '/wishlist',
      query: {'currency': AppConfig.currency},
    );
    return parseResponse(() {
      // Accept a bare list or an `{items}` wrapper.
      final items = data is List ? data : asJson(data)['items'];
      return listOf(items, WishlistItem.fromJson, 'wishlist');
    });
  }

  Future<void> add(String offerId) async {
    await _api.post('/wishlist', body: {'offerId': offerId});
  }

  Future<void> remove(String offerId) async {
    await _api.delete('/wishlist/${Uri.encodeComponent(offerId)}');
  }
}

class AccountRepository {
  const AccountRepository(this._api);

  final ApiClient _api;

  Future<Profile> profile() async {
    final data = await _api.get('/users/me');
    return parseResponse(() => Profile.fromJson(asJson(data)));
  }

  Future<Profile> updateProfile({
    required String firstName,
    required String lastName,
    required String phone,
  }) async {
    final data = await _api.patch(
      '/users/me',
      body: {
        if (firstName.trim().isNotEmpty) 'firstName': firstName.trim(),
        if (lastName.trim().isNotEmpty) 'lastName': lastName.trim(),
        if (phone.trim().isNotEmpty) 'phone': phone.trim(),
      },
    );
    return parseResponse(() => Profile.fromJson(asJson(data)));
  }

  Future<List<Address>> addresses() async {
    final data = await _api.get('/users/me/addresses');
    return parseResponse(() => listOf(data, Address.fromJson, 'addresses'));
  }

  Future<Address> createAddress(AddressDraft draft) async {
    final data = await _api.post('/users/me/addresses', body: draft.toJson());
    return parseResponse(() => Address.fromJson(asJson(data)));
  }

  Future<Address> updateAddress(String id, AddressDraft draft) async {
    final data = await _api.patch(
      '/users/me/addresses/${Uri.encodeComponent(id)}',
      body: draft.toJson(),
    );
    return parseResponse(() => Address.fromJson(asJson(data)));
  }

  Future<void> deleteAddress(String id) async {
    await _api.delete('/users/me/addresses/${Uri.encodeComponent(id)}');
  }

  Future<void> setDefaultAddress(String id) async {
    await _api.post('/users/me/addresses/${Uri.encodeComponent(id)}/default');
  }
}

class CheckoutRepository {
  const CheckoutRepository(this._api);

  final ApiClient _api;

  Future<CheckoutQuote> quote(String shippingAddressId) async {
    final data = await _api.post(
      '/checkout/quote',
      body: {
        'shippingAddressId': shippingAddressId,
        'currency': AppConfig.currency,
      },
    );
    return parseResponse(() => CheckoutQuote.fromJson(asJson(data)));
  }

  /// Places the order and starts payment.
  ///
  /// [idempotencyKey] must be the same for every attempt at the *same*
  /// checkout. If the connection drops after the server has created the
  /// order, retrying with the same key returns that order instead of
  /// creating a second one and charging twice.
  Future<CheckoutResult> placeOrder({
    required String shippingAddressId,
    required PaymentDetails payment,
    required String idempotencyKey,
  }) async {
    final data = await _api.post(
      '/checkout',
      headers: {'Idempotency-Key': idempotencyKey},
      body: {
        'shippingAddressId': shippingAddressId,
        'currency': AppConfig.currency,
        'paymentDetails': payment.toJson(),
      },
    );
    return parseResponse(() => CheckoutResult.fromJson(asJson(data)));
  }

  /// Asks the API to reconcile with the gateway and report where the payment
  /// stands. Safe to call repeatedly; it is how the app recovers after being
  /// backgrounded or killed mid-payment.
  Future<PaymentState> refreshPayment(String paymentId) async {
    final data = await _api.post(
      '/payments/${Uri.encodeComponent(paymentId)}/status',
    );
    return parseResponse(() => PaymentState.fromJson(asJson(data)));
  }
}

class OrderRepository {
  const OrderRepository(this._api);

  final ApiClient _api;

  Future<List<Order>> orders() async {
    final data = await _api.get('/orders');
    return parseResponse(() {
      final list = data is List ? data : asJson(data)['data'];
      return listOf(list, Order.fromJson, 'orders')
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
    });
  }

  Future<Order> order(String id) async {
    final data = await _api.get('/orders/${Uri.encodeComponent(id)}');
    return parseResponse(() => Order.fromJson(asJson(data)));
  }

  Future<List<Shipment>> shipments(String orderId) async {
    final data = await _api.get(
      '/orders/${Uri.encodeComponent(orderId)}/shipments',
    );
    return parseResponse(() => listOf(data, Shipment.fromJson, 'shipments'));
  }
}
