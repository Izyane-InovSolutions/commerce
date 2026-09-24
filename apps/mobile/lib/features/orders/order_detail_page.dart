import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/util/money.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';
import '../../domain/catalog.dart';
import '../../domain/orders.dart';
import 'order_status_chip.dart';

class _OrderView {
  const _OrderView(this.order, this.offers, this.shipments);

  final Order order;
  final Map<String, OfferDetail> offers;
  final List<Shipment> shipments;
}

class OrderDetailPage extends StatefulWidget {
  const OrderDetailPage({super.key, required this.orderId});

  final String orderId;

  @override
  State<OrderDetailPage> createState() => _OrderDetailPageState();
}

class _OrderDetailPageState extends State<OrderDetailPage> {
  late final Loader<_OrderView> _view;
  bool _initialised = false;
  bool _checkingPayment = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final services = context.services;
    _view = Loader(() async {
      final order = await services.orders.order(widget.orderId);
      final results = await Future.wait([
        services.catalog.offers(order.items.map((item) => item.offerId)),
        // Shipments only exist once fulfilment starts; their absence is not
        // an error worth failing the whole page over.
        services.orders.shipments(order.id).catchError((_) => <Shipment>[]),
      ]);
      return _OrderView(order, results[0] as Map<String, OfferDetail>,
          results[1] as List<Shipment>);
    });
  }

  @override
  void dispose() {
    _view.dispose();
    super.dispose();
  }

  Future<void> _checkPayment(OrderPayment payment) async {
    setState(() => _checkingPayment = true);
    try {
      final state = await context.services.checkout.refreshPayment(payment.id);
      await _view.load(silent: true);
      if (mounted) showMessage(context, state.status.label);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _checkingPayment = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Order details')),
      body: LoaderView(
        loader: _view,
        builder: (context, view) {
          final theme = Theme.of(context);
          final order = view.order;
          final payment = order.payment;
          final currency = order.currency;

          return RefreshIndicator(
            onRefresh: () => _view.load(silent: true),
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(children: [
                  Expanded(
                    child: Text('Order ${order.reference}',
                        style: theme.textTheme.headlineSmall),
                  ),
                  OrderStatusChip(order: order),
                ]),
                const SizedBox(height: 4),
                Text('Placed ${formatDateTime(order.createdAt)}',
                    style: theme.textTheme.bodyMedium),
                if (payment != null) ...[
                  const SizedBox(height: 16),
                  Card(
                    child: ListTile(
                      leading: Icon(
                        payment.status == PaymentStatus.succeeded
                            ? Icons.verified_rounded
                            : payment.status.isInFlight
                                ? Icons.hourglass_top_rounded
                                : Icons.error_outline_rounded,
                      ),
                      title: Text(payment.status.label),
                      subtitle: payment.failureReason == null
                          ? null
                          : Text(payment.failureReason!),
                      trailing: payment.status.isInFlight
                          ? TextButton(
                              onPressed: _checkingPayment
                                  ? null
                                  : () => _checkPayment(payment),
                              child: Text(_checkingPayment ? 'Checking…' : 'Check status'),
                            )
                          : null,
                    ),
                  ),
                ],
                const SizedBox(height: 20),
                Text('Items', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                for (final item in order.items)
                  _ItemRow(item: item, offer: view.offers[item.offerId]),
                const Divider(height: 32),
                _Total('Subtotal', formatMoney(order.subtotal, currency)),
                _Total('Shipping', order.shippingAmount == 0
                    ? 'Free'
                    : formatMoney(order.shippingAmount, currency)),
                _Total('Total', formatMoney(order.total, currency), bold: true),
                if (order.shippingAddress != null) ...[
                  const SizedBox(height: 24),
                  Text('Delivering to', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Text(order.shippingAddress!.recipientName,
                      style: theme.textTheme.bodyLarge),
                  for (final line in order.shippingAddress!.lines)
                    Text(line, style: theme.textTheme.bodyMedium),
                ],
                const SizedBox(height: 24),
                Text('Tracking', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                if (view.shipments.isEmpty)
                  Text(
                    order.status == OrderStatus.paid
                        ? 'Tracking appears here once your order ships.'
                        : 'Tracking starts once payment is confirmed.',
                    style: theme.textTheme.bodyMedium,
                  )
                else
                  for (final shipment in view.shipments) _ShipmentCard(shipment),
                const SizedBox(height: 24),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.offer});

  final OrderItem item;
  final OfferDetail? offer;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: InkWell(
        onTap: offer == null ? null : () => context.push('/product/${offer!.productSlug}'),
        child: Row(children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox.square(dimension: 52, child: ApiImage(offer?.imageUrl)),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(offer?.title ?? 'Item',
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                Text('Qty ${item.quantity} × ${formatMoney(item.unitAmount, item.currency)}',
                    style: theme.textTheme.bodySmall),
              ],
            ),
          ),
          Text(formatMoney(item.lineTotal, item.currency),
              style: theme.textTheme.titleSmall),
        ]),
      ),
    );
  }
}

class _Total extends StatelessWidget {
  const _Total(this.label, this.value, {this.bold = false});

  final String label;
  final String value;
  final bool bold;

  @override
  Widget build(BuildContext context) {
    final style = bold
        ? Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)
        : Theme.of(context).textTheme.bodyLarge;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(children: [Expanded(child: Text(label, style: style)), Text(value, style: style)]),
    );
  }
}

class _ShipmentCard extends StatelessWidget {
  const _ShipmentCard(this.shipment);

  final Shipment shipment;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(shipment.statusLabel, style: theme.textTheme.titleSmall),
            Text(
              [
                shipment.methodName,
                if (shipment.trackingReference != null) 'Ref ${shipment.trackingReference}',
              ].where((part) => part.isNotEmpty).join(' · '),
              style: theme.textTheme.bodySmall,
            ),
            if (shipment.estimatedDeliveryAt != null)
              Text('Expected ${formatDate(shipment.estimatedDeliveryAt!)}',
                  style: theme.textTheme.bodySmall),
            if (shipment.events.isNotEmpty) const SizedBox(height: 12),
            for (final event in shipment.events)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.circle, size: 10, color: theme.colorScheme.primary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(event.description ?? humanizeStatus(event.status)),
                          Text(
                            [formatDateTime(event.occurredAt), if (event.location != null) event.location!]
                                .join(' · '),
                            style: theme.textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
