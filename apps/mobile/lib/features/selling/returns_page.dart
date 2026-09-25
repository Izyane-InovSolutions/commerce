import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/util/money.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/seller_feedback.dart';
import '../../domain/selling.dart';

/// Items customers are sending back. The Commerce team receives and
/// inspects returns and settles refunds, so this is for knowing, not doing:
/// what is coming back, why, and what it cost.
class ReturnsPage extends StatefulWidget {
  const ReturnsPage({super.key});

  @override
  State<ReturnsPage> createState() => _ReturnsPageState();
}

class _ReturnsPageState extends State<ReturnsPage> {
  late final Loader<SellerPage<SellerReturn>> _returns;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _returns = Loader(context.services.selling.returns);
  }

  @override
  void dispose() {
    _returns.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Returns',
      onRefresh: () => _returns.load(silent: true),
      slivers: [
        LoaderSliver(
          loader: _returns,
          builder: (context, page) {
            if (page.items.isEmpty) {
              return const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Glyphs.returnItem,
                  title: 'No returns',
                  message:
                      'When a customer sends something back, it shows '
                      'here with why and what was refunded.',
                ),
              );
            }
            final open = page.items.where((r) => r.open).toList();
            final closed = page.items.where((r) => !r.open).toList();
            Widget group(String title, List<SellerReturn> items) => InsetGroup(
              title: title,
              children: [
                for (final r in items)
                  ListRow(
                    leading: Glyphs.returnItem,
                    title: r.reasonLabel,
                    subtitle: [
                      '${formatDate(r.createdAt)}, ${r.requested} '
                          '${r.requested == 1 ? 'item' : 'items'}',
                      if (r.received > 0) '${r.received} received',
                      if (r.rejected > 0) '${r.rejected} refused at inspection',
                      if (r.refunded > 0)
                        '${formatMoney(r.refunded, r.currency)} refunded',
                    ].join('\n'),
                    trailing: StatusBadge(
                      r.statusLabel,
                      tone: r.open ? Tone.warning : Tone.neutral,
                    ),
                  ),
              ],
            );
            return SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                Space.gutter,
                Space.x3,
                Space.gutter,
                0,
              ),
              sliver: SliverList.list(
                children: [
                  if (open.isNotEmpty) group('In progress', open),
                  if (open.isNotEmpty && closed.isNotEmpty)
                    const SizedBox(height: Space.x6),
                  if (closed.isNotEmpty) group('Settled', closed),
                  const SizedBox(height: Space.x3),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: Space.x4),
                    child: Text(
                      'The Commerce team receives and inspects returns and '
                      'handles refunds.',
                      style: context.type.caption.copyWith(
                        color: context.colors.inkMuted,
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ],
    );
  }
}
