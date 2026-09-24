import '../core/network/json.dart';
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

/// How the customer will pay. Mobile money only in this app for now: card
/// checkout sends raw card numbers through this API, which puts the app in
/// PCI scope — a decision to take deliberately, not by default.
class PaymentDetails {
  const PaymentDetails({required this.provider, required this.phoneNumber});

  final MobileMoneyProvider provider;
  final String phoneNumber;

  /// Same rule as the API's validator. The server stays authoritative; this
  /// only saves a round trip for an obvious typo.
  static final phonePattern = RegExp(r'^(?:0|\+?260)9\d{8}$');

  static String normalizePhone(String raw) =>
      raw.replaceAll(RegExp(r'[\s-]'), '');

  Json toJson() => {
    'paymentMethod': 'MOBILE_MONEY',
    'provider': provider.wireValue,
    'phoneNumber': normalizePhone(phoneNumber),
  };
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
    this.redirectUrl,
  });

  factory CheckoutResult.fromJson(Json json) {
    final payment = json.obj('payment');
    return CheckoutResult(
      orderId: json.obj('order').str('id'),
      paymentId: payment.str('id'),
      paymentStatus: paymentStatusFrom(payment.strOrNull('status')),
      redirectUrl: payment.strOrNull('redirectUrl'),
    );
  }

  final String orderId;
  final String paymentId;
  final PaymentStatus paymentStatus;
  final String? redirectUrl;
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
