import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/util/money.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/selling.dart';

typedef _Earnings = ({SellerBalance balance, SellerPage<LedgerEntry> ledger});

/// What the seller has earned, what is held, and every sale, refund and
/// payout behind those numbers.
class EarningsPage extends StatefulWidget {
  const EarningsPage({super.key});

  @override
  State<EarningsPage> createState() => _EarningsPageState();
}

class _EarningsPageState extends State<EarningsPage> {
  late final Loader<_Earnings> _earnings;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _earnings = Loader(() async {
      final (balance, ledger) = await (
        selling.balance(),
        selling.ledger(limit: 50),
      ).wait;
      return (balance: balance, ledger: ledger);
    });
  }

  @override
  void dispose() {
    _earnings.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Earnings',
      onRefresh: () => _earnings.load(silent: true),
      slivers: [
        LoaderSliver(
          loader: _earnings,
          builder: (context, earnings) => SliverPadding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              0,
            ),
            sliver: SliverList.list(children: _sections(context, earnings)),
          ),
        ),
      ],
    );
  }

  List<Widget> _sections(BuildContext context, _Earnings earnings) {
    final colors = context.colors;
    final b = earnings.balance;
    Widget amount(int value) =>
        Price(value, b.currency, size: PriceSize.inline);
    return [
      InsetGroup(
        title: 'Balance',
        footer:
            'Sales are held until their return window closes. Ask for what '
            'is available from Payouts.',
        children: [
          ListRow(title: 'Available', trailing: amount(b.available)),
          ListRow(title: 'Held', trailing: amount(b.held)),
          ListRow(title: 'Being paid out', trailing: amount(b.pendingPayout)),
          ListRow(title: 'Paid out so far', trailing: amount(b.paid)),
        ],
      ),
      const SizedBox(height: Space.x6),
      if (earnings.ledger.items.isEmpty)
        const EmptyState(
          icon: Glyphs.card,
          title: 'No activity yet',
          message: 'Sales, refunds and payouts are listed here as they happen.',
        )
      else
        InsetGroup(
          title: 'Activity',
          children: [
            for (final entry in earnings.ledger.items)
              ListRow(
                title: entry.label,
                subtitle: [
                  formatDate(entry.createdAt),
                  if (entry.commission != 0)
                    '${formatMoney(entry.commission.abs(), entry.currency)} '
                        'commission',
                  if (entry.description case final d? when d.isNotEmpty) d,
                ].join('\n'),
                trailing: Price(
                  entry.net,
                  entry.currency,
                  size: PriceSize.inline,
                  color: entry.net < 0 ? colors.danger : null,
                ),
              ),
          ],
        ),
    ];
  }
}
