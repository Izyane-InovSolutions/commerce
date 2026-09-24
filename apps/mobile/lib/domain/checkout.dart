import '../core/network/json.dart';
import 'card.dart';
import 'money.dart';
import 'orders.dart';

enum MobileMoneyProvider { mtn, airtel }

extension MobileMoneyProviderInfo on MobileMoneyProvider {
  String get wireValue => switch (this) {
    MobileMoneyProvider.mtn => 'MTN',
    MobileMoneyProvider.airtel => 'AIRTEL',
  };

  String get label => switch (this) {
    MobileMoneyProvider.mtn => 'MTN MoMo',
    MobileMoneyProvider.airtel => 'Airtel Money',
  };
}

enum PaymentMethod { mobileMoney, card }

extension PaymentMethodInfo on PaymentMethod {
  String get label => switch (this) {
    PaymentMethod.mobileMoney => 'Mobile money',
    PaymentMethod.card => 'Card',
  };
}

/// How the customer will pay: exactly the `paymentDetails` the API
/// validates, for each method it accepts.
sealed class PaymentDetails {
  const PaymentDetails();

  PaymentMethod get method;

  Json toJson();

  /// Same rule as the API's validator. The server stays authoritative; this
  /// only saves a round trip for an obvious typo.
  static final phonePattern = RegExp(r'^(?:0|\+?260)9\d{8}$');

  static String normalizePhone(String raw) =>
      raw.replaceAll(RegExp(r'[\s-]'), '');
}

class MobileMoneyPayment extends PaymentDetails {
  const MobileMoneyPayment({required this.provider, required this.phoneNumber});

  final MobileMoneyProvider provider;
  final String phoneNumber;

  @override
  PaymentMethod get method => PaymentMethod.mobileMoney;

  @override
  Json toJson() => {
    'paymentMethod': 'MOBILE_MONEY',
    'provider': provider.wireValue,
    'phoneNumber': PaymentDetails.normalizePhone(phoneNumber),
  };
}

/// See the PCI note in `card.dart`.
class CardPayment extends PaymentDetails {
  const CardPayment(this.card);

  final CardDetails card;

  @override
  PaymentMethod get method => PaymentMethod.card;

  @override
  Json toJson() => {'paymentMethod': 'CARD', 'card': card.toJson()};
}

class ShippingGroup {
  const ShippingGroup({
    required this.subtotal,
    required this.shippingAmount,
    required this.total,
    required this.serviceLevel,
    this.minDays,
    this.maxDays,
  });

  factory ShippingGroup.fromJson(Json json) => ShippingGroup(
    subtotal: json.intOrNull('subtotal') ?? 0,
    shippingAmount: json.intOrNull('shippingAmount') ?? 0,
    total: json.intOrNull('total') ?? 0,
    serviceLevel: json.strOrNull('serviceLevel') ?? 'STANDARD',
    minDays: json.intOrNull('estimatedDeliveryMinDays'),
    maxDays: json.intOrNull('estimatedDeliveryMaxDays'),
  );

  final int subtotal;
  final int shippingAmount;
  final int total;
  final String serviceLevel;
  final int? minDays;
  final int? maxDays;

  String? get deliveryEstimate {
    if (minDays == null && maxDays == null) return null;
    if (minDays == maxDays || maxDays == null) return '$minDays days';
    if (minDays == null) return 'up to $maxDays days';
    return '$minDays–$maxDays days';
  }
}

/// What checkout would charge right now — the server's numbers, shown as-is.
class CheckoutQuote {
  const CheckoutQuote({
    required this.currency,
    required this.subtotal,
    required this.shippingAmount,
    required this.total,
    required this.groups,
  });

  factory CheckoutQuote.fromJson(Json json) => CheckoutQuote(
    currency: json.str('currency'),
    subtotal: json.integer('subtotal'),
    shippingAmount: json.intOrNull('shippingAmount') ?? 0,
    total: json.integer('total'),
    groups: json.list('shippingGroups', ShippingGroup.fromJson),
  );

  final String currency;
  final int subtotal;
  final int shippingAmount;
  final int total;
  final List<ShippingGroup> groups;

  Money money(int amount) => Money(amount, currency);
}

class CheckoutResult {
  const CheckoutResult({
    required this.orderId,
    required this.paymentId,
    required this.paymentStatus,
    this.failureReason,
  });

  factory CheckoutResult.fromJson(Json json) {
    final payment = json.obj('payment');
    return CheckoutResult(
      orderId: json.obj('order').str('id'),
      paymentId: payment.str('id'),
      paymentStatus: paymentStatusFrom(payment.strOrNull('status')),
      failureReason: payment.strOrNull('failureReason'),
    );
  }

  final String orderId;
  final String paymentId;
  final PaymentStatus paymentStatus;

  /// The gateway's reason, when the payment failed on the spot.
  final String? failureReason;

  /// A card is charged inside the checkout request itself, so a decline
  /// comes back here: the API has already cancelled the order and left the
  /// cart as it was.
  bool get failedOnTheSpot =>
      paymentStatus == PaymentStatus.failed ||
      paymentStatus == PaymentStatus.cancelled;
}

/// The payment as the API sees it after reconciling with the gateway.
class PaymentState {
  const PaymentState({
    required this.id,
    required this.orderId,
    required this.status,
    this.expiresAt,
  });

  factory PaymentState.fromJson(Json json) => PaymentState(
    id: json.str('id'),
    orderId: json.str('orderId'),
    // `localStatus` is the API's verdict. The gateway's own status rides
    // alongside it, but the app must never decide an order is paid from
    // anything but the API's own state.
    status: paymentStatusFrom(
      json.strOrNull('localStatus') ?? json.strOrNull('status'),
    ),
    expiresAt: json.objOrNull('gateway')?.dateOrNull('expiresAt'),
  );

  final String id;
  final String orderId;
  final PaymentStatus status;
  final DateTime? expiresAt;
}
