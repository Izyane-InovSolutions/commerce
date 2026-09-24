import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
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
        // Shipments exist only once fulfilment starts; their absence is not
        // worth failing the whole page over.
        services.orders.shipments(order.id).catchError((_) => <Shipment>[]),
      ]);
      return _OrderView(
        order,
        results[0] as Map<String, OfferDetail>,
        results[1] as List<Shipment>,
      );
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
    return ListenableBuilder(
      listenable: _view,
      builder: (context, _) {
        final view = _view.data;
        if (view == null) {
          return PageScaffold(
            title: 'Order',
            body: _view.error != null
                ? ErrorState(
                    message: _view.errorMessage!,
                    requestId: _view.requestId,
                    onRetry: _view.load,
                  )
                : const LoadingState(),
          );
        }
        final order = view.order;
        final payment = order.payment;
        final colors = context.colors;
        final type = context.type;

        return PageScaffold(
          title: 'Order ${order.reference}',
          onRefresh: () => _view.load(silent: true),
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              sliver: SliverList.list(
                children: [
                  const SizedBox(height: Space.x2),
                  Row(
                    children: [
                      OrderStatusChip(order: order),
                      const SizedBox(width: Space.x3),
                      Expanded(
                        child: Text(
                          'Placed ${formatDateTime(order.createdAt)}',
                          style: type.small.copyWith(color: colors.inkMuted),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.x5),
                  Price(order.total, order.currency, size: PriceSize.total),
                  if (payment != null) ...[
                    const SizedBox(height: Space.x5),
                    InsetGroup(
                      children: [
                        ListRow(
                          leading: payment.status == PaymentStatus.succeeded
                              ? Glyphs.verified
                              : payment.status.isInFlight
                              ? Glyphs.hourglass
                              : Glyphs.alert,
                          title: payment.status.label,
                          subtitle:
                              payment.failureReason ??
                              (payment.status.isInFlight
                                  ? 'Approve the prompt on your phone, then check again.'
                                  : null),
                          trailing: payment.status.isInFlight
                              ? (_checkingPayment
                                    ? const Spinner(size: 20)
                                    : Text(
                                        'Check',
                                        style: type.label.copyWith(
                                          color: colors.accent,
                                        ),
                                      ))
                              : null,
                          showChevron: false,
                          onPressed:
                              payment.status.isInFlight && !_checkingPayment
                              ? () => _checkPayment(payment)
                              : null,
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: Space.x6),
                  InsetGroup(
                    title: 'Items',
                    children: [
                      for (final item in order.items)
                        _ItemRow(item: item, offer: view.offers[item.offerId]),
                    ],
                  ),
                  const SizedBox(height: Space.x6),
                  InsetGroup(
                    title: 'Summary',
                    children: [
                      ListRow(
                        title: 'Items',
                        trailing: Price(
                          order.subtotal,
                          order.currency,
                          size: PriceSize.inline,
                        ),
                      ),
                      ListRow(
                        title: 'Delivery',
                        trailing: order.shippingAmount == 0
                            ? Text(
                                'Free',
                                style: type.label.copyWith(
                                  color: colors.accent,
                                ),
                              )
                            : Price(
                                order.shippingAmount,
                                order.currency,
                                size: PriceSize.inline,
                              ),
                      ),
                    ],
                  ),
                  if (order.shippingAddress != null) ...[
                    const SizedBox(height: Space.x6),
                    InsetGroup(
                      title: 'Delivering to',
                      children: [
                        ListRow(
                          leading: Glyphs.pin,
                          title: order.shippingAddress!.recipientName,
                          subtitle: [
                            ...order.shippingAddress!.lines,
                            ?order.shippingAddress!.phone,
                          ].join('\n'),
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: Space.x6),
                  _Tracking(order: order, shipments: view.shipments),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item, required this.offer});

  final OrderItem item;
  final OfferDetail? offer;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    return Pressable(
      onPressed: offer == null
          ? null
          : () => context.push('/product/${offer!.productSlug}'),
      pressScale: 1,
      dimOnPress: false,
      focusRadius: Radii.group,
      builder: (context, states) => AnimatedContainer(
        duration: Motion.fast,
        color: states.contains(PressState.pressed)
            ? colors.tile
            : const Color(0x00000000),
        padding: const EdgeInsets.all(Space.x3),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: const BorderRadius.all(Radii.chip),
              child: SizedBox.square(
                dimension: 52,
                child: ApiImage(offer?.imageUrl),
              ),
            ),
            const SizedBox(width: Space.x3),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    offer?.title ?? 'Item',
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: type.body,
                  ),
                  Text(
                    item.quantity == 1 ? 'Qty 1' : 'Qty ${item.quantity}',
                    style: type.caption.copyWith(color: colors.inkMuted),
                  ),
                ],
              ),
            ),
            Price(item.lineTotal, item.currency, size: PriceSize.inline),
          ],
        ),
      ),
    );
  }
}

/// Delivery progress as a timeline: newest event first, the line between
/// dots showing it is one journey, not a list of unrelated facts.
class _Tracking extends StatelessWidget {
  const _Tracking({required this.order, required this.shipments});

  final Order order;
  final List<Shipment> shipments;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    if (shipments.isEmpty) {
      return InsetGroup(
        title: 'Tracking',
        children: [
          ListRow(
            leading: Glyphs.truck,
            title: order.status == OrderStatus.paid
                ? 'Tracking appears here once it ships'
                : 'Tracking starts once payment is confirmed',
          ),
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final shipment in shipments) ...[
          InsetGroup(
            title: shipments.length > 1
                ? 'Shipment ${shipment.number}'
                : 'Tracking',
            children: [
              Padding(
                padding: const EdgeInsets.all(Space.x4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(shipment.statusLabel, style: type.heading),
                    if (shipment.methodName.isNotEmpty)
                      Text(
                        shipment.methodName,
                        style: type.small.copyWith(color: colors.inkMuted),
                      ),
                    if (shipment.trackingReference != null)
                      Text(
                        'Tracking number ${shipment.trackingReference}',
                        style: type.small.copyWith(color: colors.inkMuted),
                      ),
                    if (shipment.estimatedDeliveryAt != null)
                      Text(
                        'Expected ${formatDate(shipment.estimatedDeliveryAt!)}',
                        style: type.small.copyWith(color: colors.inkMuted),
                      ),
                    if (shipment.events.isNotEmpty)
                      const SizedBox(height: Space.x4),
                    for (final (index, event) in shipment.events.indexed)
                      _TimelineEvent(
                        event: event,
                        latest: index == 0,
                        last: index == shipment.events.length - 1,
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: Space.x4),
        ],
      ],
    );
  }
}

class _TimelineEvent extends StatelessWidget {
  const _TimelineEvent({
    required this.event,
    required this.latest,
    required this.last,
  });

  final ShipmentEvent event;
  final bool latest;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          SizedBox(
            width: 20,
            child: Column(
              children: [
                const SizedBox(height: 5),
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: latest ? colors.accent : colors.line,
                    shape: BoxShape.circle,
                  ),
                ),
                if (!last)
                  Expanded(child: Container(width: 2, color: colors.line)),
              ],
            ),
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: Space.x4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    event.description ?? humanizeStatus(event.status),
                    style: latest ? type.bodyStrong : type.body,
                  ),
                  Text(
                    event.location == null
                        ? formatDateTime(event.occurredAt)
                        : '${formatDateTime(event.occurredAt)}, ${event.location}',
                    style: type.caption.copyWith(color: colors.inkMuted),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
