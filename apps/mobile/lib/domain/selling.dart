import '../core/network/json.dart';
import 'money.dart';

/// Selling: a customer's seller account and its day-to-day work — orders to
/// answer and send, listings, stock and earnings. Shapes are the API's
/// `/sellers/me/*` responses; amounts are minor units, as everywhere.

enum SellerStatus { pending, approved, rejected, suspended, unknown }

SellerStatus _sellerStatus(String? value) => switch (value) {
  'PENDING' => SellerStatus.pending,
  'APPROVED' => SellerStatus.approved,
  'REJECTED' => SellerStatus.rejected,
  'SUSPENDED' => SellerStatus.suspended,
  _ => SellerStatus.unknown,
};

class SellerAccount {
  const SellerAccount({
    required this.id,
    required this.businessName,
    required this.status,
    this.displayName,
    this.storefrontSlug,
    this.description,
    this.reviewReason,
    this.registrationNumber = '',
    this.country = 'ZM',
    this.businessAddress = '',
    this.contactEmail = '',
    this.version = 0,
  });

  factory SellerAccount.fromJson(Json json) => SellerAccount(
    id: json.str('id'),
    businessName: json.str('businessName'),
    status: _sellerStatus(json.strOrNull('status')),
    displayName: json.strOrNull('displayName'),
    storefrontSlug: json.strOrNull('storefrontSlug'),
    description: json.strOrNull('description'),
    reviewReason: json.strOrNull('reviewReason'),
    registrationNumber: json.strOrNull('registrationNumber') ?? '',
    country: json.strOrNull('country') ?? 'ZM',
    businessAddress: json.strOrNull('businessAddress') ?? '',
    contactEmail: json.strOrNull('contactEmail') ?? '',
    version: json.intOrNull('version') ?? 0,
  );

  final String id;
  final String businessName;
  final SellerStatus status;
  final String? displayName;
  final String? storefrontSlug;

  final String? description;

  /// Why an application was turned down, or an account suspended.
  final String? reviewReason;
  final String registrationNumber;
  final String country;
  final String businessAddress;
  final String contactEmail;

  /// Shared by storefront edits and reviews; sent back with a storefront
  /// update so a stale screen cannot overwrite a newer change.
  final int version;

  String get name =>
      (displayName?.trim().isNotEmpty ?? false) ? displayName! : businessName;
}

/// Where the signed-in user stands as a seller. The API answers 404 before
/// anyone has applied; that is a state, not an error.
sealed class SellerStanding {
  const SellerStanding();
}

class NotASeller extends SellerStanding {
  const NotASeller();
}

class HasSellerAccount extends SellerStanding {
  const HasSellerAccount(this.account);

  final SellerAccount account;
}

/// What a seller application sends. Documents are uploaded first; this
/// carries their asset ids.
class SellerApplication {
  const SellerApplication({
    required this.businessName,
    required this.registrationNumber,
    required this.country,
    required this.businessAddress,
    required this.contactEmail,
    required this.documentIds,
  });

  final String businessName;
  final String registrationNumber;
  final String country;
  final String businessAddress;
  final String contactEmail;
  final List<String> documentIds;

  Json toJson() => {
    'businessName': businessName.trim(),
    'registrationNumber': registrationNumber.trim(),
    'country': country.trim().toUpperCase(),
    'businessAddress': businessAddress.trim(),
    'contactEmail': contactEmail.trim(),
    'documentIds': documentIds,
  };
}

class SellerBalance {
  const SellerBalance({
    required this.available,
    required this.held,
    required this.pendingPayout,
    required this.paid,
    required this.currency,
  });

  factory SellerBalance.fromJson(Json json) => SellerBalance(
    // `balance` is the older name for `availableBalance`.
    available:
        json.intOrNull('availableBalance') ?? json.intOrNull('balance') ?? 0,
    held: json.intOrNull('heldBalance') ?? 0,
    pendingPayout: json.intOrNull('pendingPayoutBalance') ?? 0,
    paid: json.intOrNull('paidBalance') ?? 0,
    currency: json.strOrNull('currency') ?? 'ZMW',
  );

  /// Earned and free to be paid out.
  final int available;

  /// Earned, but held until the return window on those orders closes.
  final int held;
  final int pendingPayout;
  final int paid;
  final String currency;
}

enum LedgerType { sale, refund, payout, unknown }

class LedgerEntry {
  const LedgerEntry({
    required this.id,
    required this.type,
    required this.gross,
    required this.commission,
    required this.net,
    required this.currency,
    required this.createdAt,
    this.description,
    this.availableAt,
  });

  factory LedgerEntry.fromJson(Json json) => LedgerEntry(
    id: json.str('id'),
    type: switch (json.strOrNull('type')) {
      'SALE' => LedgerType.sale,
      'REFUND' => LedgerType.refund,
      'PAYOUT' => LedgerType.payout,
      _ => LedgerType.unknown,
    },
    gross: json.intOrNull('grossAmount') ?? 0,
    commission: json.intOrNull('commissionAmount') ?? 0,
    net: json.intOrNull('netAmount') ?? 0,
    currency: json.strOrNull('currency') ?? 'ZMW',
    createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    description: json.strOrNull('description'),
    availableAt: json.dateOrNull('availableAt'),
  );

  final String id;
  final LedgerType type;
  final int gross;
  final int commission;

  /// What the seller actually gets (or loses): gross less commission.
  final int net;
  final String currency;
  final DateTime createdAt;
  final String? description;

  /// When a sale's money stops being held.
  final DateTime? availableAt;

  String get label => switch (type) {
    LedgerType.sale => 'Sale',
    LedgerType.refund => 'Refund',
    LedgerType.payout => 'Payout',
    LedgerType.unknown => 'Adjustment',
  };
}

/// One page of a `/sellers/me/*` list: `{items, total, page, limit}`.
class SellerPage<T> {
  const SellerPage({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
  });

  factory SellerPage.fromJson(Json json, T Function(Json) parse) => SellerPage(
    items: json.list('items', parse),
    total: json.intOrNull('total') ?? 0,
    page: json.intOrNull('page') ?? 1,
    limit: json.intOrNull('limit') ?? 20,
  );

  final List<T> items;
  final int total;
  final int page;
  final int limit;

  bool get hasMore => page * limit < total;
}

// ---------------------------------------------------------------- orders

enum FulfillmentStage {
  awaitingAcceptance,
  toPack,
  toDispatch,
  partlyDispatched,
  dispatched,
  onHold,
  cancelled,
  unknown,
}

FulfillmentStage _stage(String? status) => switch (status) {
  'AWAITING_ACCEPTANCE' => FulfillmentStage.awaitingAcceptance,
  'READY_TO_PICK' ||
  'PICKING' ||
  'PARTIALLY_PICKED' ||
  'PICKED' ||
  'PACKING' ||
  'PARTIALLY_PACKED' => FulfillmentStage.toPack,
  'PACKED' => FulfillmentStage.toDispatch,
  'PARTIALLY_DISPATCHED' => FulfillmentStage.partlyDispatched,
  'DISPATCHED' => FulfillmentStage.dispatched,
  'ON_HOLD' => FulfillmentStage.onHold,
  'PARTIALLY_CANCELLED' => FulfillmentStage.partlyDispatched,
  'CANCELLED' => FulfillmentStage.cancelled,
  _ => FulfillmentStage.unknown,
};

extension FulfillmentStageInfo on FulfillmentStage {
  String get label => switch (this) {
    FulfillmentStage.awaitingAcceptance => 'Needs your answer',
    FulfillmentStage.toPack => 'To pack',
    FulfillmentStage.toDispatch => 'Ready to send',
    FulfillmentStage.partlyDispatched => 'Partly sent',
    FulfillmentStage.dispatched => 'Sent',
    FulfillmentStage.onHold => 'On hold',
    FulfillmentStage.cancelled => 'Cancelled',
    FulfillmentStage.unknown => 'In progress',
  };

  /// Waiting on the seller rather than on the platform or the courier.
  bool get needsSeller => const {
    FulfillmentStage.awaitingAcceptance,
    FulfillmentStage.toPack,
    FulfillmentStage.toDispatch,
    FulfillmentStage.partlyDispatched,
  }.contains(this);
}

class SellerOrderLine {
  const SellerOrderLine({
    required this.id,
    required this.offerId,
    required this.quantity,
    required this.unitAmount,
    required this.lineTotal,
    required this.currency,
  });

  factory SellerOrderLine.fromJson(Json json) => SellerOrderLine(
    id: json.str('id'),
    offerId: json.str('offerId'),
    quantity: json.integer('quantity'),
    unitAmount: json.intOrNull('unitAmount') ?? 0,
    lineTotal: json.intOrNull('lineTotal') ?? 0,
    currency: json.strOrNull('currency') ?? 'ZMW',
  );

  final String id;
  final String offerId;
  final int quantity;
  final int unitAmount;
  final int lineTotal;
  final String currency;
}

/// A seller order as listed: the seller's share of a customer's order.
class SellerOrderSummary {
  const SellerOrderSummary({
    required this.id,
    required this.orderId,
    required this.total,
    required this.currency,
    required this.createdAt,
    required this.lines,
    required this.stage,
  });

  factory SellerOrderSummary.fromJson(Json json) {
    final fulfilments = json.list(
      'fulfillmentOrders',
      (f) => (
        awaiting: f.boolean('awaitingAcceptance'),
        stage: _stage(f.strOrNull('status')),
      ),
    );
    return SellerOrderSummary(
      id: json.str('id'),
      orderId: json.str('orderId'),
      total: json.intOrNull('total') ?? 0,
      currency: json.strOrNull('currency') ?? 'ZMW',
      createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
      lines: json.list('items', SellerOrderLine.fromJson),
      stage: _mostUrgent([
        for (final f in fulfilments)
          f.awaiting ? FulfillmentStage.awaitingAcceptance : f.stage,
      ]),
    );
  }

  final String id;
  final String orderId;
  final int total;
  final String currency;
  final DateTime createdAt;
  final List<SellerOrderLine> lines;

  /// The stage that most needs the seller, across all of its shipments.
  final FulfillmentStage stage;

  String get reference => orderId.substring(0, 8).toUpperCase();
  int get itemCount => lines.fold(0, (sum, line) => sum + line.quantity);
}

FulfillmentStage _mostUrgent(List<FulfillmentStage> stages) {
  if (stages.isEmpty) return FulfillmentStage.unknown;
  for (final stage in FulfillmentStage.values) {
    if (stages.contains(stage)) return stage;
  }
  return FulfillmentStage.unknown;
}

class FulfillmentLine {
  const FulfillmentLine({
    required this.id,
    required this.orderItemId,
    required this.allocated,
    required this.packed,
    required this.dispatched,
    required this.cancelled,
    required this.shipmentAssigned,
  });

  factory FulfillmentLine.fromJson(Json json) => FulfillmentLine(
    id: json.str('id'),
    orderItemId: json.str('orderItemId'),
    allocated: json.intOrNull('allocatedQuantity') ?? 0,
    packed: json.intOrNull('packedQuantity') ?? 0,
    dispatched: json.intOrNull('dispatchedQuantity') ?? 0,
    cancelled: json.intOrNull('cancelledQuantity') ?? 0,
    shipmentAssigned: json.intOrNull('shipmentAssignedQuantity') ?? 0,
  );

  final String id;
  final String orderItemId;
  final int allocated;
  final int packed;
  final int dispatched;
  final int cancelled;
  final int shipmentAssigned;

  /// The API's own limits for each action.
  int get packable => allocated - cancelled - packed;
  int get dispatchable => packed - dispatched;
  int get cancellable => allocated - cancelled - shipmentAssigned;
}

/// The part of a seller order that ships together, and what the seller can
/// do with it next.
class Fulfillment {
  const Fulfillment({
    required this.id,
    required this.version,
    required this.stage,
    required this.lines,
    this.heldReason,
  });

  factory Fulfillment.fromJson(Json json) => Fulfillment(
    id: json.strOrNull('id'),
    version: json.intOrNull('version') ?? 0,
    stage: json.boolean('awaitingAcceptance')
        ? FulfillmentStage.awaitingAcceptance
        : _stage(json.strOrNull('status')),
    lines: json.list('lines', FulfillmentLine.fromJson),
    heldReason: json.strOrNull('heldReason'),
  );

  /// Null when the platform ships this part; the seller then has nothing to
  /// do with it.
  final String? id;
  final int version;
  final FulfillmentStage stage;
  final List<FulfillmentLine> lines;
  final String? heldReason;

  bool get canAnswer =>
      id != null && stage == FulfillmentStage.awaitingAcceptance;
  bool get canPack =>
      id != null && !canAnswer && lines.any((l) => l.packable > 0);
  bool get canDispatch =>
      id != null && !canAnswer && lines.any((l) => l.dispatchable > 0);
  bool get canCancel =>
      id != null && !canAnswer && lines.any((l) => l.cancellable > 0);
}

class SellerShipment {
  const SellerShipment({
    required this.id,
    required this.status,
    this.carrier,
    this.trackingReference,
    this.dispatchedAt,
  });

  factory SellerShipment.fromJson(Json json) => SellerShipment(
    id: json.str('id'),
    status: json.strOrNull('status') ?? 'PENDING_BOOKING',
    carrier: json.strOrNull('carrierCode'),
    trackingReference: json.strOrNull('trackingReference'),
    dispatchedAt: json.dateOrNull('dispatchedAt'),
  );

  final String id;
  final String status;
  final String? carrier;
  final String? trackingReference;
  final DateTime? dispatchedAt;

  /// Past these, a shipment's story is over and takes no more updates.
  bool get trackable => !const {
    'DELIVERED',
    'DELIVERY_FAILED',
    'RETURN_TO_SENDER',
    'RETURNED',
    'CANCELLED',
  }.contains(status);

  String get statusLabel => switch (status) {
    'PENDING_BOOKING' || 'BOOKED' => 'Booked',
    'DISPATCHED' => 'Sent',
    'IN_TRANSIT' => 'On the way',
    'OUT_FOR_DELIVERY' => 'Out for delivery',
    'DELIVERED' => 'Delivered',
    'DELIVERY_FAILED' => 'Delivery failed',
    'EXCEPTION' => 'Delayed',
    'RETURN_TO_SENDER' || 'RETURNED' => 'Returned',
    'CANCELLED' => 'Cancelled',
    _ => 'In progress',
  };
}

/// The updates a seller may post on a shipment they send, and what each
/// is called on screen.
const trackingUpdates = {
  'IN_TRANSIT': 'On the way',
  'OUT_FOR_DELIVERY': 'Out for delivery',
  'DELIVERED': 'Delivered',
  'EXCEPTION': 'Delayed',
  'DELIVERY_FAILED': "Couldn't be delivered",
  'RETURN_TO_SENDER': 'Coming back to you',
  'RETURNED': 'Back with you',
};

class SellerShippingGroup {
  const SellerShippingGroup({
    required this.id,
    required this.sellerShips,
    required this.fulfillments,
    required this.shipments,
    required this.destination,
    this.method,
  });

  factory SellerShippingGroup.fromJson(Json json) {
    final to = json.objOrNull('destination') ?? const {};
    return SellerShippingGroup(
      id: json.str('id'),
      sellerShips: json.strOrNull('fulfillmentMode') == 'SELLER',
      method: json.strOrNull('methodName'),
      fulfillments: json.list('fulfillmentOrders', Fulfillment.fromJson),
      shipments: json.list('shipments', SellerShipment.fromJson),
      destination: [
        to.strOrNull('recipientName'),
        to.strOrNull('phone'),
        to.strOrNull('line1'),
        to.strOrNull('line2'),
        [
          to.strOrNull('city'),
          to.strOrNull('region'),
        ].whereType<String>().where((s) => s.isNotEmpty).join(', '),
        to.strOrNull('country'),
      ].whereType<String>().where((s) => s.trim().isNotEmpty).toList(),
    );
  }

  final String id;

  /// True when the seller packs and sends this group themselves.
  final bool sellerShips;
  final String? method;
  final List<Fulfillment> fulfillments;
  final List<SellerShipment> shipments;

  /// Only the city until the seller accepts the order; the full address
  /// after, for a group they ship themselves.
  final List<String> destination;
}

class SellerOrder {
  const SellerOrder({
    required this.summary,
    required this.subtotal,
    required this.shippingAmount,
    required this.groups,
  });

  factory SellerOrder.fromJson(Json json) => SellerOrder(
    summary: SellerOrderSummary.fromJson(json),
    subtotal: json.intOrNull('subtotal') ?? 0,
    shippingAmount: json.intOrNull('shippingAmount') ?? 0,
    groups: json.list('shippingGroups', SellerShippingGroup.fromJson),
  );

  final SellerOrderSummary summary;
  final int subtotal;
  final int shippingAmount;
  final List<SellerShippingGroup> groups;
}

// ---------------------------------------------------------------- listings

enum ListingStatus { draft, published, archived, unknown }

class Listing {
  const Listing({
    required this.id,
    required this.title,
    required this.sku,
    required this.status,
    required this.version,
    required this.sellerStock,
    this.price,
    this.variantId = '',
    this.condition,
    this.fulfilmentMode,
  });

  factory Listing.fromJson(Json json) {
    final now = DateTime.now();
    // The price in force now: started, not ended, latest first.
    final prices =
        json
            .list(
              'prices',
              (p) => (
                money: Money(p.integer('amount'), p.str('currency')),
                starts: p.dateOrNull('startsAt'),
                ends: p.dateOrNull('endsAt'),
              ),
            )
            .where(
              (p) =>
                  (p.starts == null || !p.starts!.isAfter(now)) &&
                  (p.ends == null || p.ends!.isAfter(now)),
            )
            .toList()
          ..sort(
            (a, b) =>
                (b.starts ?? DateTime(0)).compareTo(a.starts ?? DateTime(0)),
          );
    return Listing(
      id: json.str('id'),
      title: json.strOrNull('listingTitle') ?? 'Untitled listing',
      sku: json.strOrNull('sellerSku') ?? '',
      status: switch (json.strOrNull('status')) {
        'DRAFT' => ListingStatus.draft,
        'PUBLISHED' => ListingStatus.published,
        'ARCHIVED' => ListingStatus.archived,
        _ => ListingStatus.unknown,
      },
      version: json.intOrNull('version') ?? 0,
      sellerStock: json.strOrNull('stockSource') == 'SELLER',
      price: prices.firstOrNull?.money,
      variantId: json.strOrNull('variantId') ?? '',
      condition: json.strOrNull('condition'),
      fulfilmentMode: json.strOrNull('fulfillmentMode'),
    );
  }

  final String id;
  final String title;
  final String sku;
  final ListingStatus status;
  final int version;

  /// The seller keeps the stock count, rather than the platform's warehouse.
  final bool sellerStock;
  final Money? price;
  final String variantId;

  /// Wire values: `NEW`, `USED`, `REFURBISHED`.
  final String? condition;

  /// Wire values: `SELLER`, `PLATFORM`.
  final String? fulfilmentMode;

  String get statusLabel => switch (status) {
    ListingStatus.draft => 'Hidden',
    ListingStatus.published => 'Live',
    ListingStatus.archived => 'Archived',
    ListingStatus.unknown => 'Unknown',
  };
}

class StockLevel {
  const StockLevel({
    required this.offerId,
    required this.title,
    required this.sku,
    required this.onHand,
    required this.reserved,
    required this.available,
    required this.version,
  });

  factory StockLevel.fromJson(Json json) => StockLevel(
    offerId: json.str('offerId'),
    title: json.strOrNull('listingTitle') ?? 'Untitled listing',
    sku: json.strOrNull('sellerSku') ?? '',
    onHand: json.intOrNull('onHand') ?? 0,
    reserved: json.intOrNull('reserved') ?? 0,
    available: json.intOrNull('available') ?? 0,
    version: json.intOrNull('version') ?? 0,
  );

  final String offerId;
  final String title;
  final String sku;

  /// On the shelf, counted by the seller.
  final int onHand;

  /// Held for orders not yet sent.
  final int reserved;

  /// What shoppers can still buy.
  final int available;
  final int version;
}
