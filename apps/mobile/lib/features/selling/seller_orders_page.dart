import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/selling.dart';

Tone _tone(FulfillmentStage stage) => switch (stage) {
  FulfillmentStage.awaitingAcceptance => Tone.warning,
  FulfillmentStage.toPack ||
  FulfillmentStage.toDispatch ||
  FulfillmentStage.partlyDispatched => Tone.warning,
  FulfillmentStage.dispatched => Tone.accent,
  FulfillmentStage.cancelled || FulfillmentStage.onHold => Tone.danger,
  FulfillmentStage.unknown => Tone.neutral,
};

class SellerOrdersPage extends StatefulWidget {
  const SellerOrdersPage({super.key});

  @override
  State<SellerOrdersPage> createState() => _SellerOrdersPageState();
}

class _SellerOrdersPageState extends State<SellerOrdersPage> {
  late final Loader<SellerPage<SellerOrderSummary>> _orders;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _orders = Loader(() => selling.orders(limit: 50));
  }

  @override
  void dispose() {
    _orders.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Orders',
      onRefresh: () => _orders.load(silent: true),
      slivers: [
        LoaderSliver(
          loader: _orders,
          builder: (context, page) {
            if (page.items.isEmpty) {
              return const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Glyphs.receipt,
                  title: 'No orders yet',
                  message:
                      'When someone buys one of your listings, the order '
                      'shows up here for you to accept and send.',
                ),
              );
            }
            // What needs the seller comes first; within that, newest first.
            final orders = [...page.items]
              ..sort((a, b) {
                final urgent =
                    (b.stage.needsSeller ? 1 : 0) -
                    (a.stage.needsSeller ? 1 : 0);
                return urgent != 0
                    ? urgent
                    : b.createdAt.compareTo(a.createdAt);
              });
            return SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                Space.gutter,
                Space.x3,
                Space.gutter,
                0,
              ),
              sliver: SliverToBoxAdapter(
                child: InsetGroup(
                  footer: page.hasMore
                      ? 'Showing the latest ${page.items.length} of '
                            '${page.total}. The rest are on the seller portal.'
                      : null,
                  children: [
                    for (final order in orders)
                      _OrderRow(
                        order: order,
                        onOpen: () async {
                          await context.push('/selling/orders/${order.id}');
                          _orders.load(silent: true);
                        },
                      ),
                  ],
                ),
              ),
            );
          },
        ),
      ],
    );
  }
}

class _OrderRow extends StatelessWidget {
  const _OrderRow({required this.order, required this.onOpen});

  final SellerOrderSummary order;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final items = order.itemCount == 1 ? '1 item' : '${order.itemCount} items';
    return Pressable(
      onPressed: onOpen,
      pressScale: 1,
      dimOnPress: false,
      focusRadius: Radii.group,
      semanticLabel:
          'Order ${order.reference}, ${order.stage.label}, '
          '${formatDate(order.createdAt)}, $items',
      excludeChildSemantics: true,
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
                    '${formatDateTime(order.createdAt)}, $items',
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
                  const SizedBox(height: Space.x2),
                  StatusBadge(order.stage.label, tone: _tone(order.stage)),
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

typedef _Detail = ({SellerOrder order, Map<String, String> titles});

class SellerOrderPage extends StatefulWidget {
  const SellerOrderPage({super.key, required this.id});

  final String id;

  @override
  State<SellerOrderPage> createState() => _SellerOrderPageState();
}

class _SellerOrderPageState extends State<SellerOrderPage> {
  late final Loader<_Detail> _detail;
  bool _initialised = false;

  /// The fulfilment an action is running on, so only its buttons wait.
  String? _busy;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _detail = Loader(() async {
      final order = await selling.order(widget.id);
      final titles = await selling.listingTitles(
        order.summary.lines.map((l) => l.offerId),
      );
      return (order: order, titles: titles);
    });
  }

  @override
  void dispose() {
    _detail.dispose();
    super.dispose();
  }

  /// Runs one action, says what happened, and reloads the order — its
  /// versions and quantities have all moved on.
  Future<void> _act(
    Fulfillment f,
    Future<void> Function() action,
    String done,
  ) async {
    setState(() => _busy = f.id);
    try {
      await action();
      if (mounted) showMessage(context, done);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      await _detail.load(silent: true);
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _decline(Fulfillment f) async {
    final answer = await askFor(
      context,
      title: 'Decline this order?',
      message:
          'The customer is refunded in full and the order is closed. Tell '
          'them why.',
      fields: const [
        AskField(label: 'Reason', hint: 'Out of stock', initial: ''),
      ],
      confirmLabel: 'Decline order',
      destructive: true,
    );
    if (answer == null || !mounted) return;
    final selling = context.services.selling;
    await _act(f, () => selling.decline(f, answer[0]), 'Order declined');
  }

  Future<void> _dispatch(Fulfillment f) async {
    final answer = await askFor(
      context,
      title: 'Mark as sent',
      message: 'Who is delivering it? The customer sees this with the order.',
      fields: const [
        AskField(label: 'Courier', hint: 'Postnet, DHL, own delivery'),
        AskField(label: 'Tracking number (optional)', optional: true),
      ],
      confirmLabel: 'Mark as sent',
    );
    if (answer == null || !mounted) return;
    final selling = context.services.selling;
    await _act(
      f,
      () => selling.dispatchAll(
        f,
        carrier: answer[0],
        trackingReference: answer[1],
      ),
      'Marked as sent',
    );
  }

  Future<void> _track(SellerShipment shipment) async {
    final status = await chooseOption<String>(
      context,
      title: 'Where is it now?',
      options: [
        for (final MapEntry(key: wire, value: label) in trackingUpdates.entries)
          SheetOption(wire, label),
      ],
    );
    if (status == null || !mounted) return;
    final details = await askFor(
      context,
      title: trackingUpdates[status]!,
      message: 'The customer sees this on their order.',
      fields: const [
        AskField(label: 'Where (optional)', hint: 'Ndola', optional: true),
        AskField(label: 'Note (optional)', optional: true),
      ],
      confirmLabel: 'Post update',
    );
    if (details == null || !mounted) return;
    final selling = context.services.selling;
    try {
      await selling.addTracking(
        shipment.id,
        status: status,
        location: details[0],
        description: details[1],
      );
      if (mounted) showMessage(context, 'Update posted');
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
    await _detail.load(silent: true);
  }

  Future<void> _cancel(Fulfillment f) async {
    final answer = await askFor(
      context,
      title: 'Cancel what hasn’t been sent?',
      message:
          'The customer is refunded for everything not yet sent. Tell them '
          'why.',
      fields: const [AskField(label: 'Reason', hint: 'Out of stock')],
      confirmLabel: 'Cancel items',
      destructive: true,
    );
    if (answer == null || !mounted) return;
    final selling = context.services.selling;
    await _act(
      f,
      () => selling.cancelRemaining(f, answer[0]),
      'Items cancelled',
    );
  }

  /// The fulfilments the seller can act on, each with its next step.
  List<Fulfillment> _actionable(SellerOrder order) => [
    for (final group in order.groups)
      if (group.sellerShips)
        for (final f in group.fulfillments)
          if (f.canAnswer || f.canPack || f.canDispatch) f,
  ];

  _NextStep _nextStep(Fulfillment f) {
    final selling = context.services.selling;
    return _NextStep(
      fulfillment: f,
      busy: _busy == f.id,
      onAccept: () => _act(f, () => selling.accept(f), 'Order accepted'),
      onDecline: () => _decline(f),
      onPack: () => _act(f, () => selling.packAll(f), 'Marked as packed'),
      onDispatch: () => _dispatch(f),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _detail,
      builder: (context, _) {
        final order = _detail.data?.order;
        final actionable = order == null
            ? const <Fulfillment>[]
            : _actionable(order);
        // One thing to do next — the usual case — is pinned above the dock,
        // where a thumb finds it; several stay beside their shipments.
        final pinned = actionable.length == 1 ? actionable.single : null;
        return PageScaffold(
          title: order == null ? 'Order' : 'Order ${order.summary.reference}',
          onRefresh: () => _detail.load(silent: true),
          bottomBar: pinned == null ? null : _nextStep(pinned),
          slivers: [
            LoaderSliver(
              loader: _detail,
              builder: (context, detail) => SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  Space.gutter,
                  Space.x2,
                  Space.gutter,
                  0,
                ),
                sliver: SliverList.list(
                  children: _sections(context, detail, pinned: pinned),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  List<Widget> _sections(
    BuildContext context,
    _Detail detail, {
    required Fulfillment? pinned,
  }) {
    final colors = context.colors;
    final type = context.type;
    final order = detail.order;
    final summary = order.summary;
    final lineById = {for (final l in summary.lines) l.id: l};
    return [
      Row(
        children: [
          StatusBadge(summary.stage.label, tone: _tone(summary.stage)),
          const SizedBox(width: Space.x2),
          Flexible(
            child: Text(
              'Placed ${formatDateTime(summary.createdAt)}',
              style: type.small.copyWith(color: colors.inkMuted),
            ),
          ),
        ],
      ),
      const SizedBox(height: Space.x6),
      InsetGroup(
        title: 'Items',
        children: [
          for (final line in summary.lines)
            ListRow(
              title: detail.titles[line.offerId] ?? 'Listing',
              subtitle: 'Qty ${line.quantity}',
              trailing: Price(
                line.lineTotal,
                line.currency,
                size: PriceSize.inline,
              ),
            ),
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
              summary.currency,
              size: PriceSize.inline,
            ),
          ),
          ListRow(
            title: 'Delivery',
            trailing: Price(
              order.shippingAmount,
              summary.currency,
              size: PriceSize.inline,
            ),
          ),
          ListRow(
            title: 'Total',
            trailing: Price(
              summary.total,
              summary.currency,
              size: PriceSize.inline,
            ),
          ),
        ],
      ),
      for (final (i, group) in order.groups.indexed) ...[
        const SizedBox(height: Space.x6),
        InsetGroup(
          title: order.groups.length > 1
              ? 'Shipment ${i + 1} of ${order.groups.length}'
              : 'Delivery',
          footer: group.sellerShips
              ? null
              : 'Commerce packs and sends this part from its warehouse; '
                    "there's nothing for you to do.",
          children: [
            if (group.destination.isNotEmpty)
              ListRow(
                leading: Glyphs.pin,
                title: group.destination.first,
                subtitle: group.destination.skip(1).join('\n'),
              ),
            if (group.method != null)
              ListRow(leading: Glyphs.truck, title: group.method!),
            for (final shipment in group.shipments)
              ListRow(
                leading: Glyphs.truck,
                onPressed: group.sellerShips && shipment.trackable
                    ? () => _track(shipment)
                    : null,
                trailing: group.sellerShips && shipment.trackable
                    ? Text(
                        'Update',
                        style: type.label.copyWith(color: colors.accent),
                      )
                    : null,
                showChevron: false,
                title: shipment.statusLabel,
                subtitle: [
                  if (shipment.carrier != null) shipment.carrier!,
                  if (shipment.trackingReference != null)
                    'Tracking ${shipment.trackingReference}',
                ].join(', '),
              ),
          ],
        ),
        for (final f in group.fulfillments)
          if (group.sellerShips && f.id != null)
            _Actions(
              fulfillment: f,
              busy: _busy == f.id,
              lines: [
                for (final l in f.lines)
                  if (lineById[l.orderItemId] case final item?)
                    (detail.titles[item.offerId] ?? 'Listing', l),
              ],
              next:
                  identical(f, pinned) ||
                      !(f.canAnswer || f.canPack || f.canDispatch)
                  ? null
                  : _nextStep(f),
              onCancel: () => _cancel(f),
            ),
      ],
    ];
  }
}

/// The next step for one fulfilment the seller ships themselves, in the
/// order they happen: answer, pack, send.
class _NextStep extends StatelessWidget {
  const _NextStep({
    required this.fulfillment,
    required this.busy,
    required this.onAccept,
    required this.onDecline,
    required this.onPack,
    required this.onDispatch,
  });

  final Fulfillment fulfillment;
  final bool busy;
  final VoidCallback onAccept;
  final VoidCallback onDecline;
  final VoidCallback onPack;
  final VoidCallback onDispatch;

  @override
  Widget build(BuildContext context) {
    final f = fulfillment;
    if (f.canAnswer) {
      return Row(
        children: [
          Button(
            label: 'Decline',
            variant: ButtonVariant.secondary,
            expand: false,
            onPressed: busy ? null : onDecline,
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Button(
              label: 'Accept order',
              loading: busy,
              haptic: Haptic.medium,
              onPressed: busy ? null : onAccept,
            ),
          ),
        ],
      );
    }
    if (f.canPack) {
      return Button(
        label: 'Mark as packed',
        loading: busy,
        onPressed: busy ? null : onPack,
      );
    }
    return Button(
      label: 'Mark as sent',
      loading: busy,
      haptic: Haptic.medium,
      onPressed: busy || !f.canDispatch ? null : onDispatch,
    );
  }
}

/// What to know about one fulfilment: why it waits, how far it has got,
/// and — when it is not pinned to the bottom — its next step.
class _Actions extends StatelessWidget {
  const _Actions({
    required this.fulfillment,
    required this.busy,
    required this.lines,
    required this.next,
    required this.onCancel,
  });

  final Fulfillment fulfillment;
  final bool busy;
  final List<(String, FulfillmentLine)> lines;
  final Widget? next;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final f = fulfillment;
    final colors = context.colors;
    final type = context.type;
    final active = f.canAnswer || f.canPack || f.canDispatch;
    final progress = [
      for (final (title, l) in lines)
        '$title: ${l.packed} of ${l.allocated - l.cancelled} packed, '
            '${l.dispatched} sent',
    ];
    return Padding(
      padding: const EdgeInsets.only(top: Space.x3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (f.canAnswer)
            const Callout(
              message:
                  'Accept to confirm you can send this. You then see the '
                  "customer's full address.",
              tone: Tone.warning,
            )
          else if (f.heldReason != null)
            Callout(message: f.heldReason!, tone: Tone.danger)
          else if (active && progress.isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: Space.x4),
              child: Text(
                progress.join('\n'),
                style: type.small.copyWith(color: colors.inkMuted),
              ),
            ),
          if (next != null) ...[const SizedBox(height: Space.x3), next!],
          if (f.canCancel)
            Button(
              label: 'Cancel what hasn’t been sent',
              variant: ButtonVariant.ghost,
              onPressed: busy ? null : onCancel,
            ),
        ],
      ),
    );
  }
}
