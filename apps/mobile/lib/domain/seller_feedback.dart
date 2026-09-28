import '../core/network/json.dart';

/// What comes back to a seller after a sale: returns, reviews, ratings —
/// and the stock history behind a count.

class SellerReturn {
  const SellerReturn({
    required this.id,
    required this.orderItemId,
    required this.status,
    required this.reason,
    required this.requested,
    required this.received,
    required this.accepted,
    required this.rejected,
    required this.refunded,
    required this.currency,
    required this.createdAt,
  });

  factory SellerReturn.fromJson(Json json) {
    final refunds = json.list(
      'refunds',
      (r) => (
        amount: r.intOrNull('amount') ?? 0,
        currency: r.strOrNull('currency') ?? 'ZMW',
        ok: const {
          'SUCCEEDED',
          'PARTIALLY_SUCCEEDED',
        }.contains(r.strOrNull('status')),
      ),
    );
    return SellerReturn(
      id: json.str('returnItemId'),
      orderItemId: json.strOrNull('orderItemId') ?? '',
      status: json.strOrNull('status') ?? 'REQUESTED',
      reason: json.strOrNull('reasonCode') ?? 'OTHER',
      requested: json.intOrNull('requestedQuantity') ?? 0,
      received: json.intOrNull('receivedQuantity') ?? 0,
      accepted: json.intOrNull('acceptedQuantity') ?? 0,
      rejected: json.intOrNull('rejectedQuantity') ?? 0,
      refunded: refunds.where((r) => r.ok).fold(0, (s, r) => s + r.amount),
      currency: refunds.firstOrNull?.currency ?? 'ZMW',
      createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    );
  }

  final String id;
  final String orderItemId;
  final String status;
  final String reason;
  final int requested;
  final int received;
  final int accepted;
  final int rejected;
  final int refunded;
  final String currency;
  final DateTime createdAt;

  String get reasonLabel => switch (reason) {
    'CUSTOMER_REMORSE' => 'Changed their mind',
    'WRONG_ITEM' => 'Wrong item sent',
    'DAMAGED' => 'Arrived damaged',
    'DEFECTIVE' => 'Faulty',
    'NOT_AS_DESCRIBED' => 'Not as described',
    'SIZE_FIT' => "Size or fit didn't suit",
    _ => 'Other reason',
  };

  String get statusLabel => switch (status) {
    'REQUESTED' => 'Requested',
    'APPROVED' => 'Approved, on its way back',
    'REJECTED' => 'Refused',
    'CANCELLED' => 'Withdrawn',
    'RECEIVING' || 'RECEIVED' => 'Received',
    'INSPECTING' => 'Being inspected',
    'CLOSED_NO_REFUND' => 'Closed, no refund',
    'REFUND_PENDING' => 'Refund pending',
    'PARTIALLY_REFUNDED' => 'Partly refunded',
    'REFUNDED' => 'Refunded',
    'REFUND_FAILED' => 'Refund failed',
    _ => 'In progress',
  };

  /// Still moving; the rest are settled one way or another.
  bool get open => !const {
    'REJECTED',
    'CANCELLED',
    'CLOSED_NO_REFUND',
    'REFUNDED',
  }.contains(status);
}

/// A product review or a seller rating: stars, words, and whether it is
/// showing.
class SellerFeedback {
  const SellerFeedback({
    required this.id,
    required this.rating,
    required this.reviewer,
    required this.createdAt,
    required this.visible,
    required this.reported,
    this.title,
    this.body,
    this.product,
  });

  factory SellerFeedback.fromJson(Json json) => SellerFeedback(
    id: json.str('id'),
    rating: json.intOrNull('rating') ?? 0,
    reviewer: json.strOrNull('reviewerLabel') ?? 'A customer',
    createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    visible: (json.strOrNull('visibility') ?? 'PUBLISHED') == 'PUBLISHED',
    reported: json.boolean('hasOpenReport'),
    title: json.strOrNull('title'),
    body: json.strOrNull('body') ?? json.strOrNull('comment'),
    product: json.objOrNull('product')?.strOrNull('name'),
  );

  final String id;
  final int rating;
  final String reviewer;
  final DateTime createdAt;
  final bool visible;
  final bool reported;
  final String? title;
  final String? body;

  /// Set on product reviews; null on ratings of the seller.
  final String? product;
}

class StockMovement {
  const StockMovement({
    required this.type,
    required this.quantity,
    required this.createdAt,
    this.note,
  });

  factory StockMovement.fromJson(Json json) => StockMovement(
    type: json.strOrNull('type') ?? 'ADJUSTMENT',
    quantity: json.intOrNull('quantity') ?? 0,
    createdAt: json.dateOrNull('createdAt') ?? DateTime.now(),
    note: json.strOrNull('note'),
  );

  final String type;
  final int quantity;
  final DateTime createdAt;
  final String? note;

  String get label => switch (type) {
    'RECEIPT' => 'Stock received',
    'ADJUSTMENT' => 'Recount',
    'RESERVATION' => 'Held for an order',
    'RELEASE' => 'Hold released',
    'COMMITMENT' => 'Sent to a customer',
    'RETURN' => 'Returned',
    _ => 'Change',
  };
}
