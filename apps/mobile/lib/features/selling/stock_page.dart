import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../app/brand.dart';
import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/selling.dart';

/// Stock counts for the listings the seller keeps stock for themselves.
/// Setting a count is a recount — "I have 12 on the shelf" — not an
/// adjustment, which is what the API takes and what is easy to get right
/// while standing in a storeroom.
class StockPage extends StatefulWidget {
  const StockPage({super.key});

  @override
  State<StockPage> createState() => _StockPageState();
}

class _StockPageState extends State<StockPage> {
  late final Loader<List<StockLevel>> _stock;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _stock = Loader(context.services.selling.stock);
  }

  @override
  void dispose() {
    _stock.dispose();
    super.dispose();
  }

  Future<void> _open(StockLevel level) async {
    final choice = await chooseOption<bool>(
      context,
      title: level.title,
      options: const [
        SheetOption(true, 'Enter a new count', icon: Glyphs.edit),
        SheetOption(false, 'See its history', icon: Glyphs.clock),
      ],
    );
    if (choice == null || !mounted) return;
    choice ? await _recount(level) : await _history(level);
  }

  Future<void> _history(StockLevel level) async {
    final selling = context.services.selling;
    final history = Loader(() => selling.stockHistory(level.offerId));
    await showSheet<void>(
      context,
      label: 'Stock history',
      builder: (context) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(
          Space.gutter,
          0,
          Space.gutter,
          Space.x2,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(level.title, style: context.type.heading),
            const SizedBox(height: Space.x4),
            LoaderView(
              loader: history,
              builder: (context, moves) => moves.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(Space.x6),
                      child: Text('No changes yet.'),
                    )
                  : InsetGroup(
                      children: [
                        for (final m in moves)
                          ListRow(
                            title: m.label,
                            subtitle: [
                              formatDateTime(m.createdAt),
                              if (m.note?.trim().isNotEmpty ?? false) m.note!,
                            ].join('\n'),
                            trailing: Text(
                              m.quantity > 0
                                  ? '+${m.quantity}'
                                  : '${m.quantity}',
                              style: context.type.figures(17, 680),
                            ),
                          ),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
    history.dispose();
  }

  Future<void> _recount(StockLevel level) async {
    final selling = context.services.selling;
    final answer = await askFor(
      context,
      title: level.title,
      message:
          'How many are on the shelf now? ${level.reserved} are held for '
          'orders not yet sent.',
      fields: [
        AskField(
          label: 'On hand',
          initial: '${level.onHand}',
          keyboardType: TextInputType.number,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          validate: (v) => int.tryParse(v) == null ? 'Enter a number' : null,
        ),
      ],
      confirmLabel: 'Save count',
    );
    if (answer == null || !mounted) return;
    try {
      await selling.setStock(level, int.parse(answer[0]));
      if (mounted) showMessage(context, 'Stock updated');
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
    await _stock.load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return PageScaffold(
      title: 'Stock',
      onRefresh: () => _stock.load(silent: true),
      slivers: [
        LoaderSliver(
          loader: _stock,
          builder: (context, levels) {
            if (levels.isEmpty) {
              return const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Glyphs.bag,
                  title: 'No stock to count',
                  message:
                      'Listings stocked in the ${AppBrand.name} warehouse are counted '
                      'there. Ones you stock yourself appear here.',
                ),
              );
            }
            return SliverPadding(
              padding: const EdgeInsets.fromLTRB(
                Space.gutter,
                Space.x3,
                Space.gutter,
                0,
              ),
              sliver: SliverToBoxAdapter(
                child: InsetGroup(
                  footer: 'Tap a listing to recount it or see its history.',
                  children: [
                    for (final level in levels)
                      ListRow(
                        title: level.title,
                        subtitle:
                            '${level.onHand} on hand, '
                            '${level.reserved} held for orders',
                        trailing: Semantics(
                          label: '${level.available} available',
                          excludeSemantics: true,
                          child: Text(
                            '${level.available}',
                            style: context.type
                                .figures(20, 720)
                                .copyWith(
                                  color: level.available == 0
                                      ? colors.danger
                                      : colors.ink,
                                ),
                          ),
                        ),
                        onPressed: () => _open(level),
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
