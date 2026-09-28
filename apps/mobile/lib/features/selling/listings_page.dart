import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/util/money.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/selling.dart';

enum _ListingAction { price, show, hide, edit, archive }

/// The seller's listings: what is live in the shop, at what price, with the
/// two changes a seller makes day to day — the price, and whether it is on
/// sale at all.
class ListingsPage extends StatefulWidget {
  const ListingsPage({super.key});

  @override
  State<ListingsPage> createState() => _ListingsPageState();
}

class _ListingsPageState extends State<ListingsPage> {
  late final Loader<SellerPage<Listing>> _listings;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final selling = context.services.selling;
    _listings = Loader(() => selling.listings(limit: 100));
  }

  @override
  void dispose() {
    _listings.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    try {
      await action();
      if (mounted) showMessage(context, done);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
    await _listings.load(silent: true);
  }

  Future<void> _open(Listing listing) async {
    final selling = context.services.selling;
    final action = await chooseOption<_ListingAction>(
      context,
      title: listing.title,
      options: [
        const SheetOption(
          _ListingAction.price,
          'Change the price',
          icon: Glyphs.tag,
        ),
        if (listing.status == ListingStatus.draft)
          const SheetOption(
            _ListingAction.show,
            'Put it on sale',
            subtitle: 'Shoppers can find and buy it',
            icon: Glyphs.eye,
          ),
        if (listing.status == ListingStatus.published)
          const SheetOption(
            _ListingAction.hide,
            'Take it off sale',
            subtitle: 'Hidden from the shop until you put it back',
            icon: Glyphs.eyeOff,
          ),
        if (listing.status == ListingStatus.draft)
          const SheetOption(
            _ListingAction.edit,
            'Edit details',
            subtitle: 'Title, SKU, condition and who sends it',
            icon: Glyphs.edit,
          ),
        const SheetOption(
          _ListingAction.archive,
          'Archive',
          subtitle: 'Removes it for good',
          icon: Glyphs.trash,
          destructive: true,
        ),
      ],
    );
    if (!mounted || action == null) return;
    switch (action) {
      case _ListingAction.price:
        final current = listing.price;
        final answer = await askFor(
          context,
          title: 'New price',
          message: current == null
              ? null
              : 'Now ${current.formatted}. The new price applies from now on.',
          fields: [
            AskField(
              label: 'Price in kwacha',
              hint: '4500',
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp(r'[\d.,]')),
              ],
              validate: (v) => (parseMoneyInput(v) ?? 0) > 0
                  ? null
                  : 'Enter an amount, like 4500 or 99.50',
            ),
          ],
          confirmLabel: 'Set price',
        );
        if (answer == null || !mounted) return;
        await _run(
          () => selling.setPrice(
            listing,
            parseMoneyInput(answer[0])!,
            current?.currency ?? 'ZMW',
          ),
          'Price updated',
        );
      case _ListingAction.show:
        await _run(
          () => selling.setListed(listing, live: true),
          'On sale in the shop',
        );
      case _ListingAction.hide:
        await _run(
          () => selling.setListed(listing, live: false),
          'Taken off sale',
        );
      case _ListingAction.edit:
        await context.push('/selling/listings/edit', extra: listing);
        await _listings.load(silent: true);
      case _ListingAction.archive:
        final ok = await confirm(
          context,
          title: 'Archive this listing?',
          message:
              'It leaves the shop for good and cannot be changed or put '
              'back on sale.',
          confirmLabel: 'Archive listing',
          destructive: true,
        );
        if (ok && mounted) {
          await _run(() => selling.archiveListing(listing), 'Archived');
        }
    }
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Listings',
      onRefresh: () => _listings.load(silent: true),
      bottomBar: Button(
        label: 'New listing',
        icon: Glyphs.add,
        onPressed: () async {
          await context.push('/selling/listings/new');
          await _listings.load(silent: true);
        },
      ),
      slivers: [
        LoaderSliver(
          loader: _listings,
          builder: (context, page) {
            if (page.items.isEmpty) {
              return const SliverFillRemaining(
                hasScrollBody: false,
                child: EmptyState(
                  icon: Glyphs.tag,
                  title: 'No listings yet',
                  message:
                      'A listing is something from the catalog you sell, at '
                      'your price. Create one to start selling.',
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
                  children: [
                    for (final listing in page.items)
                      ListRow(
                        title: listing.title,
                        subtitle: [
                          listing.price?.formatted ?? 'No price yet',
                          if (listing.sku.isNotEmpty) 'SKU ${listing.sku}',
                        ].join(', '),
                        trailing: StatusBadge(
                          listing.statusLabel,
                          tone: switch (listing.status) {
                            ListingStatus.published => Tone.accent,
                            ListingStatus.draft => Tone.warning,
                            _ => Tone.neutral,
                          },
                        ),
                        onPressed: listing.status == ListingStatus.archived
                            ? null
                            : () => _open(listing),
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
