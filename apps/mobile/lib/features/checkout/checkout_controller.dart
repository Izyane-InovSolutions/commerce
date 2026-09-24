import 'package:flutter/foundation.dart';

import '../../core/network/api_exception.dart';
import '../../core/util/uuid.dart';
import '../../data/commerce_repositories.dart';
import '../../domain/account.dart';
import '../../domain/card.dart';
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
    String? email,
    DateTime Function()? now,
  }) : _account = account,
       _checkout = checkout,
       _email = email,
       _now = now ?? DateTime.now;

  final AccountRepository _account;
  final CheckoutRepository _checkout;

  /// The account's email, which the card gateway needs for billing.
  final String? _email;
  final DateTime Function() _now;

  List<Address> _addresses = const [];
  Address? _address;
  bool _loadingAddresses = true;
  Object? _addressError;

  CheckoutQuote? _quote;
  bool _quoting = false;
  Object? _quoteError;

  PaymentMethod _method = PaymentMethod.mobileMoney;

  MobileMoneyProvider _provider = MobileMoneyProvider.mtn;
  String _phone = '';

  // Card entry. Memory only, cleared once the order is placed; see the PCI
  // note in domain/card.dart.
  String _cardNumber = '';
  String _cardExpiry = '';
  String _cardCode = '';
  String _cardName = '';
  bool _billingSameAsDelivery = true;
  BillingDraft _billing = const BillingDraft();

  /// Set by a failed attempt, so every card field shows what is wrong with
  /// it — not only the ones that already look finished.
  bool _showAllCardErrors = false;

  bool _placing = false;
  Object? _placeError;

  /// Why the payment itself failed, in words a shopper can act on.
  String? _paymentFailure;

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
  String? get quoteError =>
      _quoteError == null ? null : describeError(_quoteError!);

  PaymentMethod get method => _method;
  MobileMoneyProvider get provider => _provider;
  String get phone => _phone;

  bool get placing => _placing;
  String? get placeError =>
      _paymentFailure ??
      (_placeError == null ? null : describeError(_placeError!));

  bool get phoneValid => PaymentDetails.phonePattern.hasMatch(
    PaymentDetails.normalizePhone(_phone),
  );

  // ---- card

  CardBrand get cardBrand => CardNumber.brand(CardNumber.digits(_cardNumber));
  bool get billingSameAsDelivery => _billingSameAsDelivery;
  BillingDraft get billing => _billing;

  String? get cardNumberError {
    final problem = CardNumber.problem(_cardNumber);
    if (problem == null) return null;
    final shown =
        _showAllCardErrors ||
        !cardBrand.accepted ||
        CardNumber.complete(_cardNumber);
    return shown ? problem : null;
  }

  String? get cardExpiryError {
    final problem = CardExpiry.problem(_cardExpiry, _now());
    if (problem == null) return null;
    final typed = _cardExpiry.replaceAll(RegExp(r'\D'), '').length;
    return _showAllCardErrors || typed >= 4 ? problem : null;
  }

  String? get cardCodeError {
    final problem = CardSecurityCode.problem(_cardCode);
    return problem != null && _showAllCardErrors ? problem : null;
  }

  String? get cardNameError => _showAllCardErrors && _cardName.trim().isEmpty
      ? 'Enter the name as it appears on the card'
      : null;

  /// A billing field the API would reject, keyed by the field.
  String? billingError(BillingField field) =>
      _showAllCardErrors && !_billingSameAsDelivery
      ? _billing.problem(field)
      : null;

  bool get _billingValid =>
      _billingSameAsDelivery ||
      BillingField.values.every((f) => _billing.problem(f) == null);

  bool get cardValid =>
      CardNumber.problem(_cardNumber) == null &&
      CardExpiry.problem(_cardExpiry, _now()) == null &&
      CardSecurityCode.problem(_cardCode) == null &&
      _cardName.trim().isNotEmpty &&
      _billingValid &&
      _email != null;

  bool get paymentValid => switch (_method) {
    PaymentMethod.mobileMoney => phoneValid,
    PaymentMethod.card => cardValid,
  };

  bool get canPlace =>
      _address != null &&
      _quote != null &&
      !_quoting &&
      paymentValid &&
      !_placing;

  /// Whether the pay button takes a tap. For a card that is before every
  /// field is right: a tap on an incomplete card form points out what is
  /// missing, which beats a greyed-out button across a long form.
  bool get canSubmit => _method == PaymentMethod.card
      ? _address != null && _quote != null && !_quoting && !_placing
      : canPlace;

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
      _address =
          _addresses.where((a) => a.id == previous).firstOrNull ??
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

  void setMethod(PaymentMethod method) {
    if (method == _method) return;
    _method = method;
    _changed();
  }

  void setCardNumber(String value) => _setCard(() => _cardNumber = value);
  void setCardExpiry(String value) => _setCard(() => _cardExpiry = value);
  void setCardCode(String value) => _setCard(() => _cardCode = value);
  void setCardName(String value) => _setCard(() => _cardName = value);

  void setBillingSameAsDelivery(bool value) =>
      _setCard(() => _billingSameAsDelivery = value);

  void setBilling(BillingDraft billing) => _setCard(() => _billing = billing);

  void _setCard(void Function() update) {
    update();
    _changed();
  }

  PaymentDetails? _payment(Address address) {
    switch (_method) {
      case PaymentMethod.mobileMoney:
        return MobileMoneyPayment(provider: _provider, phoneNumber: _phone);
      case PaymentMethod.card:
        final expiry = CardExpiry.parse(_cardExpiry);
        final email = _email;
        if (expiry == null || email == null) return null;
        final name = _cardName.trim();
        return CardPayment(
          CardDetails(
            number: CardNumber.digits(_cardNumber),
            expiry: expiry,
            securityCode: _cardCode,
            holderName: name,
            billing: _billingSameAsDelivery
                ? CardBilling.fromAddress(
                    address,
                    holderName: name,
                    email: email,
                  )
                : _billing.toBilling(holderName: name, email: email),
          ),
        );
    }
  }

  /// Wipes everything typed about the card. Called once the order is
  /// placed, so card data outlives the request by as little as possible.
  void clearCard() {
    _cardNumber = '';
    _cardExpiry = '';
    _cardCode = '';
    _cardName = '';
    _billing = const BillingDraft();
    _billingSameAsDelivery = true;
    _showAllCardErrors = false;
  }

  /// Places the order.
  ///
  /// The idempotency key is created on the first attempt and reused on every
  /// retry of the same attempt. If the request reaches the server but the
  /// reply is lost — a dropped connection, a timeout — the retry gets back
  /// the order that was created instead of placing and charging a second
  /// one. It changes only when the order itself changes: a new address or
  /// new payment details are a different request.
  ///
  /// Returns the result only when there is a payment to follow. A payment
  /// that failed on the spot — a declined card — returns null with the
  /// reason in [placeError]: the API has cancelled that order and kept the
  /// cart, so the shopper stays here to fix the details or switch method.
  Future<CheckoutResult?> placeOrder() async {
    final address = _address;
    if (address == null || !canSubmit) return null;
    if (_method == PaymentMethod.card && !cardValid) {
      _showAllCardErrors = true;
      _notify();
      return null;
    }
    if (!canPlace) return null;
    final payment = _payment(address);
    if (payment == null) return null;
    _idempotencyKey ??= uuidV4();
    _placing = true;
    _placeError = null;
    _paymentFailure = null;
    _notify();
    try {
      final result = await _checkout.placeOrder(
        shippingAddressId: address.id,
        payment: payment,
        idempotencyKey: _idempotencyKey!,
      );
      if (result.failedOnTheSpot) {
        // That order is closed. Trying again is a new order, so it needs a
        // new key — reusing this one would only replay the failure.
        _idempotencyKey = null;
        _paymentFailure = switch (payment.method) {
          PaymentMethod.card => describeCardFailure(result.failureReason),
          PaymentMethod.mobileMoney =>
            "The payment couldn't be started, and you haven't been charged. "
                'Check the number and network, then try again.',
        };
        return null;
      }
      if (payment.method == PaymentMethod.card) clearCard();
      return result;
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
    _paymentFailure = null;
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

enum BillingField { line1, city, region, postalCode, country }

/// A billing address typed by hand, for a card whose statements go
/// somewhere other than the delivery address.
class BillingDraft {
  const BillingDraft({
    this.line1 = '',
    this.city = '',
    this.region = '',
    this.postalCode = '',
    this.country = 'ZM',
  });

  final String line1;
  final String city;
  final String region;
  final String postalCode;
  final String country;

  BillingDraft copyWith({
    String? line1,
    String? city,
    String? region,
    String? postalCode,
    String? country,
  }) => BillingDraft(
    line1: line1 ?? this.line1,
    city: city ?? this.city,
    region: region ?? this.region,
    postalCode: postalCode ?? this.postalCode,
    country: country ?? this.country,
  );

  /// The API's limits for each field.
  String? problem(BillingField field) => switch (field) {
    BillingField.line1 =>
      line1.trim().isEmpty ? 'Enter the street address' : null,
    BillingField.city => city.trim().isEmpty ? 'Enter the city' : null,
    BillingField.region => null,
    BillingField.postalCode =>
      postalCode.trim().isEmpty
          ? 'Enter the postal code'
          : postalCode.trim().length > 20
          ? 'Use 20 characters or fewer'
          : null,
    BillingField.country =>
      RegExp(r'^[A-Za-z]{2}$').hasMatch(country.trim())
          ? null
          : 'Use the 2-letter country code, like ZM',
  };

  CardBilling toBilling({required String holderName, required String email}) {
    final (first, last) = splitName(holderName);
    final city = this.city.trim();
    return CardBilling(
      firstName: first,
      lastName: last,
      address1: line1.trim(),
      locality: city,
      administrativeArea: region.trim().isEmpty ? city : region.trim(),
      postalCode: postalCode.trim(),
      country: country.trim().toUpperCase(),
      email: email,
    );
  }
}
