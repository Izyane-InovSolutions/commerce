import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../core/util/uuid.dart';
import '../../data/commerce_repositories.dart';
import '../../domain/account.dart';
import '../../domain/checkout.dart';

/// One checkout attempt: where it ships, what the server says it costs, how
/// it will be paid, and placing it.
///
/// Every number shown comes from the server's quote. This class never adds
/// anything up.
class CheckoutController extends ChangeNotifier {
  CheckoutController({
    required AccountRepository account,
    required CheckoutRepository checkout,
  })  : _account = account,
        _checkout = checkout;

  final AccountRepository _account;
  final CheckoutRepository _checkout;

  List<Address> _addresses = const [];
  Address? _address;
  bool _loadingAddresses = true;
  Object? _addressError;

  CheckoutQuote? _quote;
  bool _quoting = false;
  Object? _quoteError;

  MobileMoneyProvider _provider = MobileMoneyProvider.mtn;
  String _phone = '';

  bool _placing = false;
  Object? _placeError;

  /// Held for the life of one attempt. See [placeOrder].
  String? _idempotencyKey;
  bool _disposed = false;

  List<Address> get addresses => _addresses;
  Address? get address => _address;
  bool get loadingAddresses => _loadingAddresses;
  String? get addressError =>
      _addressError == null ? null : describeError(_addressError!);

  CheckoutQuote? get quote => _quote;
  bool get quoting => _quoting;
  String? get quoteError => _quoteError == null ? null : describeError(_quoteError!);

  MobileMoneyProvider get provider => _provider;
  String get phone => _phone;

  bool get placing => _placing;
  String? get placeError => _placeError == null ? null : describeError(_placeError!);

  bool get phoneValid =>
      PaymentDetails.phonePattern.hasMatch(PaymentDetails.normalizePhone(_phone));

  bool get canPlace =>
      _address != null && _quote != null && !_quoting && phoneValid && !_placing;

  Future<void> start({String? defaultPhone}) async {
    if (defaultPhone != null && _phone.isEmpty) _phone = defaultPhone;
    await loadAddresses();
  }

  Future<void> loadAddresses({String? select}) async {
    _loadingAddresses = true;
    _addressError = null;
    _notify();
    try {
      _addresses = await _account.addresses();
      final previous = select ?? _address?.id;
      _address = _addresses.where((a) => a.id == previous).firstOrNull ??
          _addresses.where((a) => a.isDefault).firstOrNull ??
          _addresses.firstOrNull;
      // Pre-fill the mobile money number from the delivery contact, the
      // most common case, without overwriting anything already typed.
      if (_phone.isEmpty && _address?.phone != null) _phone = _address!.phone!;
    } catch (error) {
      _addressError = error;
    } finally {
      _loadingAddresses = false;
      _notify();
    }
    if (_address != null) await refreshQuote();
  }

  Future<void> selectAddress(Address address) async {
    if (address.id == _address?.id) return;
    _address = address;
    _changed();
    await refreshQuote();
  }

  Future<void> refreshQuote() async {
    final address = _address;
    if (address == null) return;
    _quoting = true;
    _quoteError = null;
    _notify();
    try {
      final quote = await _checkout.quote(address.id);
      if (address.id == _address?.id) _quote = quote;
    } catch (error) {
      _quote = null;
      _quoteError = error;
    } finally {
      _quoting = false;
      _notify();
    }
  }

  void setProvider(MobileMoneyProvider provider) {
    if (provider == _provider) return;
    _provider = provider;
    _changed();
  }

  void setPhone(String phone) {
    if (phone == _phone) return;
    _phone = phone;
    _changed();
  }

  /// Places the order.
  ///
  /// The idempotency key is created on the first attempt and reused on every
  /// retry of the same attempt. If the request reaches the server but the
  /// reply is lost — a dropped connection, a timeout — the retry gets back
  /// the order that was created instead of placing and charging a second
  /// one. It changes only when the order itself changes: a new address or
  /// new payment details are a different request.
  Future<CheckoutResult?> placeOrder() async {
    final address = _address;
    if (address == null || !canPlace) return null;
    _idempotencyKey ??= uuidV4();
    _placing = true;
    _placeError = null;
    _notify();
    try {
      return await _checkout.placeOrder(
        shippingAddressId: address.id,
        payment: PaymentDetails(provider: _provider, phoneNumber: _phone),
        idempotencyKey: _idempotencyKey!,
      );
    } catch (error) {
      _placeError = error;
      return null;
    } finally {
      _placing = false;
      _notify();
    }
  }

  void _changed() {
    _idempotencyKey = null;
    _placeError = null;
    _notify();
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
