import 'package:flutter/widgets.dart';

import '../../design/design.dart';
import '../../domain/orders.dart';

/// One label for where an order stands, preferring the most useful fact:
/// warehouse progress once paid, otherwise the payment.
class OrderStatusChip extends StatelessWidget {
  const OrderStatusChip({super.key, required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final payment = order.payment?.status;
    final (label, tone) = switch (order.status) {
      OrderStatus.paid => (
        order.fulfillment?.label ?? 'Confirmed',
        Tone.accent,
      ),
      OrderStatus.cancelled => ('Cancelled', Tone.neutral),
      OrderStatus.refunded ||
      OrderStatus.partiallyRefunded => (order.status.label, Tone.neutral),
      _
          when payment == PaymentStatus.failed ||
              payment == PaymentStatus.cancelled =>
        (payment!.label, Tone.danger),
      _ => ('Awaiting payment', Tone.warning),
    };
    return StatusBadge(label, tone: tone);
  }
}
