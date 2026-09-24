import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/state_views.dart';
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
    return Scaffold(
      appBar: AppBar(title: const Text('Orders')),
      body: LoaderView(
        loader: _orders,
        builder: (context, orders) {
          if (orders.isEmpty) {
            return EmptyView(
              icon: Icons.receipt_long_outlined,
              title: 'No orders yet',
              message: 'Orders you place will show up here.',
              action: FilledButton.tonal(
                  onPressed: () => context.go('/'), child: const Text('Start shopping')),
            );
          }
          return RefreshIndicator(
            onRefresh: () => _orders.load(silent: true),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: orders.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final order = orders[index];
                final theme = Theme.of(context);
                return Card(
                  child: InkWell(
                    onTap: () async {
                      await context.push('/account/orders/${order.id}');
                      // A payment may have settled while the detail was open.
                      _orders.load(silent: true);
                    },
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text('Order ${order.reference}',
                                    style: theme.textTheme.titleSmall),
                                const SizedBox(height: 4),
                                Text(
                                  '${formatDate(order.createdAt)} · ${order.itemCount} '
                                  '${order.itemCount == 1 ? 'item' : 'items'}',
                                  style: theme.textTheme.bodySmall,
                                ),
                                const SizedBox(height: 8),
                                OrderStatusChip(order: order),
                              ],
                            ),
                          ),
                          Text(order.totalMoney.formatted,
                              style: theme.textTheme.titleMedium
                                  ?.copyWith(fontWeight: FontWeight.w700)),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
