import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/brand.dart';
import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../design/design.dart';
import '../../domain/money.dart';
import '../catalog/product_grid.dart';
import '../catalog/product_list_controller.dart';
import '../catalog/product_tile.dart';
import '../shop/browsing_history.dart';
import '../shop/rails.dart';
import '../shop/shop_feed.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final ProductListController _products;
  late final ShopFeed _feed;
  late final BrowsingHistory _history;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final services = context.services;
    _products = ProductListController(services.catalog)..load();
    _feed = ShopFeed(catalog: services.catalog, history: services.history)
      ..load();
    // Coming back from a product page has changed "recently viewed".
    _history = services.history..addListener(_historyChanged);
  }

  Timer? _personal;

  /// History changes in bursts (a product page records itself as it
  /// opens); refresh once it settles.
  void _historyChanged() {
    _personal?.cancel();
    _personal = Timer(const Duration(milliseconds: 600), _feed.refreshPersonal);
  }

  @override
  void dispose() {
    _personal?.cancel();
    _history.removeListener(_historyChanged);
    _products.dispose();
    _feed.dispose();
    super.dispose();
  }

  Future<void> _refresh() => Future.wait([_products.load(), _feed.load()]);

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    return PageScaffold(
      title: AppBrand.name,
      showBack: false,
      onRefresh: _refresh,
      actions: [
        IconAction(
          icon: Glyphs.person,
          semanticLabel: 'Account',
          onPressed: () => context.push('/account'),
        ),
      ],
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              0,
            ),
            child: _SearchEntry(onPressed: () => context.go('/search')),
          ),
        ),
        SliverToBoxAdapter(
          child: ListenableBuilder(
            listenable: Listenable.merge([
              _feed,
              services.history,
              services.wishlist,
            ]),
            builder: (context, _) => _Rails(feed: _feed),
          ),
        ),
        const SliverToBoxAdapter(child: SectionTitle('New arrivals')),
        ProductGridSliver(controller: _products),
      ],
    );
  }
}

/// Everything above New arrivals, in the order a shopper wants it: what
/// they were doing, then what is worth their while, then ways to browse.
class _Rails extends StatelessWidget {
  const _Rails({required this.feed});

  final ShopFeed feed;

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    final history = services.history;
    final wishlist = services.wishlist;

    if (!feed.hasLoaded && feed.error != null) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: Space.x8),
        child: ErrorState(
          message: describeError(feed.error!),
          onRetry: feed.load,
        ),
      );
    }
    if (!feed.hasLoaded) return const _RailSkeleton();

    final width = railTileWidth(context);
    final viewed = feed.viewed;
    final saved = [for (final item in wishlist.items) ?wishlist.offerFor(item)];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (feed.categories.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(top: Space.x4),
            child: SizedBox(
              height: 40,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                scrollDirection: Axis.horizontal,
                itemCount: feed.categories.length,
                separatorBuilder: (_, _) => const SizedBox(width: Space.x2),
                itemBuilder: (context, i) {
                  final c = feed.categories[i].category;
                  return SelectChip(
                    label: c.name,
                    selected: false,
                    onPressed: () =>
                        context.push('/category/${c.slug}', extra: c.name),
                  );
                },
              ),
            ),
          ),
        if (history.viewed.isNotEmpty)
          Rail(
            title: 'Recently viewed',
            actionLabel: 'Clear',
            onAction: () async {
              final ok = await confirm(
                context,
                title: 'Clear your browsing history?',
                message:
                    'Recently viewed items and past searches are removed '
                    'from this phone.',
                confirmLabel: 'Clear history',
              );
              if (ok) await history.clear();
            },
            itemCount: viewed.isNotEmpty
                ? viewed.length
                : history.viewed.length,
            itemWidth: width,
            itemExtent: SimpleTile.extent(context, width),
            itemBuilder: (context, i) {
              if (viewed.isNotEmpty) return ProductTile(product: viewed[i]);
              final v = history.viewed[i];
              return SimpleTile(
                name: v.name,
                slug: v.slug,
                imageUrl: v.imageUrl,
                price: v.price == null
                    ? null
                    : Money(v.price!, v.currency ?? 'ZMW'),
              );
            },
          ),
        if (feed.deals.isNotEmpty)
          ProductRail(
            title: 'Deals for you',
            subtitle: 'Lower than other sellers, or delivered free',
            picks: feed.deals,
          ),
        if (feed.lastSearch != null && feed.fromSearch.isNotEmpty)
          ProductRail(
            title: 'Based on your search',
            subtitle: '"${feed.lastSearch}"',
            picks: feed.fromSearch.map(Pick.new).toList(),
            actionLabel: 'See all',
            onAction: () => context.go(
              '/search?q=${Uri.encodeQueryComponent(feed.lastSearch!)}',
            ),
          ),
        if (saved.isNotEmpty)
          Rail(
            title: 'Your wishlist',
            actionLabel: 'See all',
            onAction: () => context.push('/wishlist'),
            itemCount: saved.length,
            itemWidth: width,
            itemExtent: SimpleTile.extent(context, width),
            itemBuilder: (context, i) => SimpleTile(
              name: saved[i].title,
              slug: saved[i].productSlug,
              imageUrl: saved[i].imageUrl,
              price: saved[i].price,
            ),
          ),
        if (feed.categories.any((c) => c.cover != null))
          CategoryRail(
            categories: feed.categories.where((c) => c.count > 0).toList(),
          ),
        if (feed.moreLikeViewed.isNotEmpty)
          ProductRail(
            title: 'More like what you viewed',
            picks: feed.moreLikeViewed.map(Pick.new).toList(),
          ),
        if (feed.topRated.isNotEmpty)
          ProductRail(
            title: 'Top rated',
            subtitle: 'What customers score highest',
            picks: feed.topRated,
          ),
        if (feed.sellers.isNotEmpty) SellerRail(sellers: feed.sellers),
        if (feed.underFiveHundred.isNotEmpty)
          ProductRail(title: 'Under K500', picks: feed.underFiveHundred),
      ],
    );
  }
}

class _RailSkeleton extends StatelessWidget {
  const _RailSkeleton();

  @override
  Widget build(BuildContext context) {
    final width = railTileWidth(context);
    return Rail(
      title: 'Finding things for you',
      itemCount: 4,
      itemWidth: width,
      itemExtent: SimpleTile.extent(context, width),
      itemBuilder: (_, _) => const ProductTileSkeleton(),
    );
  }
}

/// Looks like the search field; is a doorway to the Search tab, where the
/// real one lives with its filters.
class _SearchEntry extends StatelessWidget {
  const _SearchEntry({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Pressable(
      onPressed: onPressed,
      semanticLabel: 'Search products',
      excludeChildSemantics: true,
      pressScale: 0.99,
      builder: (context, _) => Container(
        height: 50,
        padding: const EdgeInsets.symmetric(horizontal: Space.x4),
        decoration: BoxDecoration(
          color: colors.tile,
          borderRadius: const BorderRadius.all(Radii.control),
        ),
        child: Row(
          children: [
            Glyph(Glyphs.search, size: 20, color: colors.inkMuted),
            const SizedBox(width: Space.x3),
            Expanded(
              child: Text(
                'Search products',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.type.body.copyWith(color: colors.inkMuted),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
