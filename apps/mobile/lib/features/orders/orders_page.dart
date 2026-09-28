import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../design/design.dart';
import '../../domain/orders.dart';
import 'order_status_chip.dart';

class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key});

  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  late final Loader<List<Order>> _orders;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _orders = Loader(context.services.orders.orders);
  }

  @override
  void dispose() {
    _orders.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _orders,
      builder: (context, _) {
        final orders = _orders.data;
        Widget fill;
        if (orders == null && _orders.error != null) {
          fill = SliverFillRemaining(
            hasScrollBody: false,
            child: ErrorState(
              message: _orders.errorMessage!,
              requestId: _orders.requestId,
              onRetry: _orders.load,
            ),
          );
        } else if (orders == null) {
          fill = const SliverFillRemaining(
            hasScrollBody: false,
            child: LoadingState(),
          );
        } else if (orders.isEmpty) {
          fill = SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Glyphs.receipt,
              title: 'No orders yet',
              message:
                  'Orders you place show up here, with their delivery progress.',
              action: Button(
                label: 'Browse the shop',
                variant: ButtonVariant.secondary,
                expand: false,
                onPressed: () => context.go('/'),
              ),
            ),
          );
        } else {
          fill = SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              0,
            ),
            sliver: SliverToBoxAdapter(
              child: InsetGroup(
                children: [
                  for (final order in orders)
                    _OrderRow(
                      order: order,
                      onReturn: () => _orders.load(silent: true),
                    ),
                ],
              ),
            ),
          );
        }
        return PageScaffold(
          title: 'Orders',
          onRefresh: () => _orders.load(silent: true),
          slivers: [fill],
        );
      },
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order, required this.onReturn});

  final Order order;

  /// A payment may have settled while the detail was open.
  final VoidCallback onReturn;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final items = order.itemCount == 1 ? '1 item' : '${order.itemCount} items';
    return Pressable(
      onPressed: () async {
        await context.push('/account/orders/${order.id}');
        onReturn();
      },
      pressScale: 1,
      dimOnPress: false,
      semanticLabel:
          'Order ${order.reference}, ${formatDate(order.createdAt)}, $items, '
          '${order.totalMoney.formatted}',
      excludeChildSemantics: true,
      focusRadius: Radii.group,
      builder: (context, states) => AnimatedContainer(
        duration: Motion.fast,
        color: states.contains(PressState.pressed)
            ? colors.tile
            : const Color(0x00000000),
        padding: const EdgeInsets.all(Space.x4),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Order ${order.reference}', style: type.bodyStrong),
                  const SizedBox(height: 2),
                  Text(
                    '${formatDate(order.createdAt)}, $items',
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
                  const SizedBox(height: Space.x2),
                  OrderStatusChip(order: order),
                ],
              ),
            ),
            Price(order.total, order.currency, size: PriceSize.inline),
            const SizedBox(width: Space.x1),
            Glyph(Glyphs.forward, color: colors.inkSubtle, size: 22),
          ],
        ),
      ),
    );
  }
}
