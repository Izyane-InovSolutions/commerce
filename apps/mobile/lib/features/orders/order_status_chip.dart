import 'package:flutter/material.dart';

import '../../domain/orders.dart';

/// One label for where an order stands, preferring the most useful fact:
/// warehouse progress once paid, otherwise the payment.
class OrderStatusChip extends StatelessWidget {
  const OrderStatusChip({super.key, required this.order});

  final Order order;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final payment = order.payment?.status;

    final (label, background, foreground) = switch (order.status) {
      OrderStatus.paid => (
          order.fulfillment?.label ?? 'Confirmed',
          scheme.primaryContainer,
          scheme.onPrimaryContainer,
        ),
      OrderStatus.cancelled => ('Cancelled', scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
      OrderStatus.refunded || OrderStatus.partiallyRefunded =>
        (order.status.label, scheme.surfaceContainerHighest, scheme.onSurfaceVariant),
      _ when payment == PaymentStatus.failed || payment == PaymentStatus.cancelled =>
        (payment!.label, scheme.errorContainer, scheme.onErrorContainer),
      _ => ('Awaiting payment', scheme.tertiaryContainer, scheme.onTertiaryContainer),
    };

    return DecoratedBox(
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        child: Text(label,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: foreground, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
