import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/brand.dart';
import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/money.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/auth.dart';
import '../../domain/selling.dart';
import '../auth/sign_in_prompt.dart';

/// The Selling tab: where a seller runs their shop, and where anyone else
/// finds out how to become one.
class SellingPage extends StatelessWidget {
  const SellingPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.services.session;
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        if (!session.isSignedIn) {
          return const PageScaffold(
            title: 'Selling',
            showBack: false,
            body: SignInPrompt(
              icon: Glyphs.tag,
              title: 'Sell on ${AppBrand.name}',
              message:
                  'Sign in to manage your orders, listings, stock and '
                  'earnings.',
              from: '/selling',
            ),
          );
        }
        // Keyed by user: a different account gets a fresh look-up.
        return _SellerHome(key: ValueKey(session.user?.id));
      },
    );
  }
}

class _SellerHome extends StatefulWidget {
  const _SellerHome({super.key});

  @override
  State<_SellerHome> createState() => _SellerHomeState();
}

class _SellerHomeState extends State<_SellerHome> {
  late final Loader<SellerStanding> _standing;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _standing = Loader(context.services.selling.standing);
  }

  @override
  void dispose() {
    _standing.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _standing,
      builder: (context, _) {
        final standing = _standing.data;
        if (standing case HasSellerAccount(
          account: final account,
        ) when account.status == SellerStatus.approved) {
          return _Dashboard(
            account: account,
            onRefresh: () => _standing.load(silent: true),
          );
        }
        return PageScaffold(
          title: 'Selling',
          showBack: false,
          onRefresh: () => _standing.load(silent: true),
          slivers: [
            LoaderSliver(
              loader: _standing,
              builder: (context, standing) => SliverFillRemaining(
                hasScrollBody: false,
                child: _Gate(standing: standing, onCheck: _standing.load),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Everything short of an approved seller account, each with what to do
/// next.
class _Gate extends StatelessWidget {
  const _Gate({required this.standing, required this.onCheck});

  final SellerStanding standing;
  final VoidCallback onCheck;

  Future<void> _apply(BuildContext context, [SellerAccount? rejected]) async {
    await context.push('/selling/apply', extra: rejected);
    onCheck();
  }

  @override
  Widget build(BuildContext context) {
    final checkAgain = Button(
      label: 'Check again',
      variant: ButtonVariant.secondary,
      expand: false,
      onPressed: onCheck,
    );
    return switch (standing) {
      NotASeller() => EmptyState(
        icon: Glyphs.store,
        title: 'Start selling',
        message:
            'Apply with your business details and registration documents. '
            "Once you're approved, you run your shop from here: listings, "
            'orders, stock and earnings.',
        action: Button(
          label: 'Apply to sell',
          expand: false,
          onPressed: () => _apply(context),
        ),
      ),
      HasSellerAccount(account: final a) => switch (a.status) {
        SellerStatus.pending => EmptyState(
          icon: Glyphs.hourglass,
          title: 'Your application is being reviewed',
          message:
              '${a.businessName} is with the ${AppBrand.name} team. Once it is '
              'approved, you can start selling here.',
          action: checkAgain,
        ),
        SellerStatus.rejected => EmptyState(
          icon: Glyphs.closeCircle,
          title: "Your application wasn't approved",
          message: [
            if (a.reviewReason != null) '"${a.reviewReason}"',
            'Correct the details and send it again.',
          ].join('\n\n'),
          action: Button(
            label: 'Update and resubmit',
            expand: false,
            onPressed: () => _apply(context, a),
          ),
        ),
        SellerStatus.suspended => EmptyState(
          icon: Glyphs.alert,
          title: 'Selling is paused',
          message: [
            if (a.reviewReason != null) '"${a.reviewReason}"',
            'Your shop is hidden and new orders are paused. Contact the '
                '${AppBrand.name} team to reopen it.',
          ].join('\n\n'),
          action: checkAgain,
        ),
        _ => EmptyState(
          icon: Glyphs.alert,
          title: "Your seller account can't be used right now",
          action: checkAgain,
        ),
      },
    };
  }
}

typedef _Overview = ({
  SellerBalance? balance,
  SellerPage<SellerOrderSummary>? orders,
  int? listings,
});

class _Dashboard extends StatefulWidget {
  const _Dashboard({required this.account, required this.onRefresh});

  final SellerAccount account;
  final Future<void> Function() onRefresh;

  @override
  State<_Dashboard> createState() => _DashboardState();
}

class _DashboardState extends State<_Dashboard> {
  late final Loader<_Overview> _overview;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _overview = Loader(_load);
  }

  Future<_Overview> _load() async {
    final services = context.services;
    final session = services.session;
    // Approval makes a customer a seller on the server, but the role in a
    // token is fixed when it is minted. Listings and stock check that role,
    // so renew once rather than have them refuse a newly approved seller.
    if (session.user?.role != UserRole.seller) await session.renewNow();
    final selling = services.selling;
    // Each part stands alone: a failing count should not blank the page.
    final results = await Future.wait<Object?>([
      selling.balance().then<Object?>((v) => v).catchError((_) => null),
      selling.orders(limit: 50).then<Object?>((v) => v).catchError((_) => null),
      selling
          .listings(limit: 1)
          .then<Object?>((v) => v.total)
          .catchError((_) => null),
    ]);
    return (
      balance: results[0] as SellerBalance?,
      orders: results[1] as SellerPage<SellerOrderSummary>?,
      listings: results[2] as int?,
    );
  }

  @override
  void dispose() {
    _overview.dispose();
    super.dispose();
  }

  Future<void> _open(String route) async {
    await context.push(route);
    _overview.load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: widget.account.name,
      showBack: false,
      onRefresh: () async {
        await Future.wait([widget.onRefresh(), _overview.load(silent: true)]);
      },
      slivers: [
        LoaderSliver(
          loader: _overview,
          builder: (context, overview) => SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              0,
            ),
            sliver: SliverList.list(children: _sections(context, overview)),
          ),
        ),
      ],
    );
  }

  List<Widget> _sections(BuildContext context, _Overview overview) {
    final colors = context.colors;
    final type = context.type;
    final balance = overview.balance;
    final orders = overview.orders;
    final waiting = orders?.items.where((o) => o.stage.needsSeller).length ?? 0;
    final answer =
        orders?.items
            .where((o) => o.stage == FulfillmentStage.awaitingAcceptance)
            .length ??
        0;

    return [
      if (balance != null)
        Pressable(
          onPressed: () => _open('/selling/earnings'),
          pressScale: 0.99,
          focusRadius: Radii.group,
          semanticLabel:
              'Earnings: ${formatMoney(balance.available, balance.currency)} '
              'available to pay out',
          excludeChildSemantics: true,
          builder: (context, _) => Container(
            padding: const EdgeInsets.all(Space.x5),
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: const BorderRadius.all(Radii.group),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Available to pay out',
                  style: type.small.copyWith(color: colors.inkMuted),
                ),
                const SizedBox(height: Space.x1),
                Price(
                  balance.available,
                  balance.currency,
                  size: PriceSize.hero,
                ),
                if (balance.held > 0 || balance.pendingPayout > 0) ...[
                  const SizedBox(height: Space.x3),
                  Text(
                    [
                      if (balance.held > 0)
                        '${formatMoney(balance.held, balance.currency)} held '
                            'until return windows close',
                      if (balance.pendingPayout > 0)
                        '${formatMoney(balance.pendingPayout, balance.currency)}'
                            ' being paid out',
                    ].join('\n'),
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
                ],
              ],
            ),
          ),
        ),
      if (answer > 0) ...[
        const SizedBox(height: Space.x4),
        Callout(
          message: answer == 1
              ? 'An order is waiting for you to accept or decline it.'
              : '$answer orders are waiting for you to accept or decline '
                    'them.',
          tone: Tone.warning,
        ),
      ],
      if (widget.account.storefrontSlug == null) ...[
        const SizedBox(height: Space.x4),
        Callout(
          message:
              'Set your shop name and web address before your listings can '
              'go on sale.',
          tone: Tone.warning,
        ),
      ],
      const SizedBox(height: Space.x6),
      InsetGroup(
        title: 'Your shop',
        children: [
          ListRow(
            leading: Glyphs.receipt,
            title: 'Orders',
            subtitle: orders == null
                ? null
                : waiting > 0
                ? '$waiting to deal with'
                : orders.total == 0
                ? 'None yet'
                : 'All caught up',
            trailing: waiting > 0
                ? StatusBadge('$waiting', tone: Tone.warning)
                : null,
            onPressed: () => _open('/selling/orders'),
          ),
          ListRow(
            leading: Glyphs.tag,
            title: 'Listings',
            subtitle: overview.listings == null
                ? null
                : overview.listings == 1
                ? '1 listing'
                : '${overview.listings} listings',
            onPressed: () => _open('/selling/listings'),
          ),
          ListRow(
            leading: Glyphs.image,
            title: 'Products',
            subtitle: 'Add new products to the catalog',
            onPressed: () => _open('/selling/products'),
          ),
          ListRow(
            leading: Glyphs.bag,
            title: 'Stock',
            subtitle: 'Counts for the listings you keep stock for',
            onPressed: () => _open('/selling/stock'),
          ),
        ],
      ),
      const SizedBox(height: Space.x6),
      InsetGroup(
        title: 'Money',
        children: [
          ListRow(
            leading: Glyphs.receipt,
            title: 'Earnings',
            subtitle: 'Sales, refunds and commission',
            onPressed: () => _open('/selling/earnings'),
          ),
          ListRow(
            leading: Glyphs.card,
            title: 'Payouts',
            subtitle: 'Where you are paid, and asking for it',
            onPressed: () => _open('/selling/payouts'),
          ),
        ],
      ),
      const SizedBox(height: Space.x6),
      InsetGroup(
        title: 'Customers',
        children: [
          ListRow(
            leading: Glyphs.returnItem,
            title: 'Returns',
            onPressed: () => _open('/selling/returns'),
          ),
          ListRow(
            leading: Glyphs.star,
            title: 'Reviews and ratings',
            onPressed: () => _open('/selling/reviews'),
          ),
        ],
      ),
      const SizedBox(height: Space.x6),
      InsetGroup(
        children: [
          ListRow(
            leading: Glyphs.store,
            title: 'Shop details',
            subtitle: widget.account.storefrontSlug == null
                ? 'Not set up yet'
                : widget.account.name,
            onPressed: () async {
              await context.push('/selling/storefront', extra: widget.account);
              await widget.onRefresh();
            },
          ),
        ],
      ),
    ];
  }
}
