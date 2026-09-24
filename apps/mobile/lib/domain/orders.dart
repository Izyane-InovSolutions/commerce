import '../core/network/json.dart';
import 'account.dart';
import 'money.dart';

enum OrderStatus {
  pendingPayment,
  paid,
  cancelled,
  partiallyRefunded,
  refunded,
  unknown,
}

OrderStatus _orderStatus(String? value) => switch (value) {
  'PENDING_PAYMENT' => OrderStatus.pendingPayment,
  'PAID' => OrderStatus.paid,
  'CANCELLED' => OrderStatus.cancelled,
  'PARTIALLY_REFUNDED' => OrderStatus.partiallyRefunded,
  'REFUNDED' => OrderStatus.refunded,
  _ => OrderStatus.unknown,
};

extension OrderStatusLabel on OrderStatus {
  String get label => switch (this) {
    OrderStatus.pendingPayment => 'Awaiting payment',
    OrderStatus.paid => 'Paid',
    OrderStatus.cancelled => 'Cancelled',
    OrderStatus.partiallyRefunded => 'Partially refunded',
    OrderStatus.refunded => 'Refunded',
    OrderStatus.unknown => 'Processing',
  };
}

enum PaymentStatus {
  pending,
  requiresAction,
  processing,
  succeeded,
  failed,
  cancelled,
  partiallyRefunded,
  refunded,
  unknown,
}

PaymentStatus paymentStatusFrom(String? value) => switch (value) {
  'PENDING' => PaymentStatus.pending,
  'REQUIRES_ACTION' => PaymentStatus.requiresAction,
  'PROCESSING' => PaymentStatus.processing,
  'SUCCEEDED' => PaymentStatus.succeeded,
  'FAILED' => PaymentStatus.failed,
  'CANCELLED' => PaymentStatus.cancelled,
  'PARTIALLY_REFUNDED' => PaymentStatus.partiallyRefunded,
  'REFUNDED' => PaymentStatus.refunded,
  _ => PaymentStatus.unknown,
};

extension PaymentStatusInfo on PaymentStatus {
  /// Still waiting on the customer or the gateway — worth polling.
  bool get isInFlight => const {
    PaymentStatus.pending,
    PaymentStatus.requiresAction,
    PaymentStatus.processing,
    PaymentStatus.unknown,
  }.contains(this);

  String get label => switch (this) {
    PaymentStatus.pending => 'Waiting for approval',
    PaymentStatus.requiresAction => 'Action required',
    PaymentStatus.processing => 'Processing',
    PaymentStatus.succeeded => 'Payment received',
    PaymentStatus.failed => 'Payment failed',
    PaymentStatus.cancelled => 'Payment cancelled',
    PaymentStatus.partiallyRefunded => 'Partially refunded',
    PaymentStatus.refunded => 'Refunded',
    PaymentStatus.unknown => 'Checking payment',
  };
}

enum FulfillmentStatus {
  preparing,
  packed,
  partiallyDispatched,
  dispatched,
  cancelled,
}

FulfillmentStatus? _fulfillment(String? value) => switch (value) {
  'PREPARING' => FulfillmentStatus.preparing,
  'PACKED' => FulfillmentStatus.packed,
  'PARTIALLY_DISPATCHED' => FulfillmentStatus.partiallyDispatched,
  'DISPATCHED' => FulfillmentStatus.dispatched,
  'CANCELLED' => FulfillmentStatus.cancelled,
  _ => null,
};

extension FulfillmentLabel on FulfillmentStatus {
  String get label => switch (this) {
    FulfillmentStatus.preparing => 'Preparing',
    FulfillmentStatus.packed => 'Packed',
    FulfillmentStatus.partiallyDispatched => 'Partly dispatched',
    FulfillmentStatus.dispatched => 'Dispatched',
    FulfillmentStatus.cancelled => 'Cancelled',
  };
}

class OrderItem {
  const OrderItem({
    required this.id,
    required this.offerId,
    required this.quantity,
    required this.unitAmount,
    required this.lineTotal,
    required this.currency,
  });

  factory OrderItem.fromJson(Json json) => OrderItem(
    id: json.str('id'),
    offerId: json.str('offerId'),
    quantity: json.integer('quantity'),
    unitAmount: json.intOrNull('unitAmount') ?? 0,
    lineTotal: json.intOrNull('lineTotal') ?? 0,
    currency: json.strOrNull('currency') ?? '',
  );

  final String id;
  final String offerId;
  final int quantity;
  final int unitAmount;
  final int lineTotal;
  final String currency;
}

class OrderPayment {
  const OrderPayment({
    required this.id,
    required this.status,
    this.failureReason,
  });

  factory OrderPayment.fromJson(Json json) => OrderPayment(
    id: json.str('id'),
    status: paymentStatusFrom(json.strOrNull('status')),
    failureReason: json.strOrNull('failureReason'),
  );

  final String id;
  final PaymentStatus status;
  final String? failureReason;
}

/// The address as it was when the order was placed — a snapshot, so it has
/// no id and does not change if the address book entry is edited later.
class OrderAddress {
  const OrderAddress(this.recipientName, this.lines, this.phone);

  factory OrderAddress.fromJson(Json json) => OrderAddress(
    json.strOrNull('recipientName') ?? '',
    formatAddressLines(
      line1: json.strOrNull('line1') ?? '',
      line2: json.strOrNull('line2'),
      city: json.strOrNull('city') ?? '',
      region: json.strOrNull('region'),
      postalCode: json.strOrNull('postalCode') ?? '',
      country: json.strOrNull('country') ?? '',
    ),
    json.strOrNull('phone'),
  );

  final String recipientName;
  final List<String> lines;
  final String? phone;
}

class Order {
  const Order({
    required this.id,
    required this.status,
    required this.currency,
    required this.subtotal,
    required this.shippingAmount,
    required this.total,
    required this.items,
    required this.createdAt,
    this.payment,
    this.fulfillment,
    this.shippingAddress,
  });

  factory Order.fromJson(Json json) => Order(
    id: json.str('id'),
    status: _orderStatus(json.strOrNull('status')),
    currency: json.str('currency'),
    subtotal: json.intOrNull('subtotal') ?? 0,
    shippingAmount: json.intOrNull('shippingAmount') ?? 0,
    total: json.integer('total'),
    items: json.list('items', OrderItem.fromJson),
    createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    payment: json.objOrNull('payment') == null
        ? null
        : OrderPayment.fromJson(json.obj('payment')),
    fulfillment: _fulfillment(json.strOrNull('fulfillmentSummary')),
    shippingAddress: json.objOrNull('shippingAddress') == null
        ? null
        : OrderAddress.fromJson(json.obj('shippingAddress')),
  );

  final String id;
  final OrderStatus status;
  final String currency;
  final int subtotal;
  final int shippingAmount;
  final int total;
  final List<OrderItem> items;
  final DateTime createdAt;
  final OrderPayment? payment;
  final FulfillmentStatus? fulfillment;
  final OrderAddress? shippingAddress;

  /// Short enough to read out over the phone to support.
  String get reference => id.substring(0, 8).toUpperCase();
  Money get totalMoney => Money(total, currency);
  int get itemCount => items.fold(0, (sum, item) => sum + item.quantity);
}

class ShipmentEvent {
  const ShipmentEvent({
    required this.status,
    required this.occurredAt,
    this.description,
    this.location,
  });

  factory ShipmentEvent.fromJson(Json json) => ShipmentEvent(
    status: json.strOrNull('normalizedStatus') ?? '',
    description: json.strOrNull('description'),
    location: json.strOrNull('location'),
    occurredAt: json.dateOrNull('occurredAt') ?? DateTime.now(),
  );

  final String status;
  final String? description;
  final String? location;
  final DateTime occurredAt;
}

class Shipment {
  const Shipment({
    required this.id,
    required this.number,
    required this.status,
    required this.methodName,
    required this.events,
    this.trackingReference,
    this.estimatedDeliveryAt,
  });

  factory Shipment.fromJson(Json json) => Shipment(
    id: json.str('id'),
    number: json.strOrNull('shipmentNumber') ?? '',
    status: json.strOrNull('status') ?? '',
    methodName: json.strOrNull('methodName') ?? '',
    trackingReference: json.strOrNull('trackingReference'),
    estimatedDeliveryAt: json.dateOrNull('estimatedDeliveryAt'),
    events: json.list('events', ShipmentEvent.fromJson)
      ..sort((a, b) => b.occurredAt.compareTo(a.occurredAt)),
  );

  final String id;
  final String number;
  final String status;
  final String methodName;
  final String? trackingReference;
  final DateTime? estimatedDeliveryAt;
  final List<ShipmentEvent> events;

  String get statusLabel => humanizeStatus(status);
}

/// `OUT_FOR_DELIVERY` → `Out for delivery`.
String humanizeStatus(String status) {
  if (status.isEmpty) return 'Unknown';
  final words = status.toLowerCase().split('_');
  return [
    '${words.first[0].toUpperCase()}${words.first.substring(1)}',
    ...words.skip(1),
  ].join(' ');
}
