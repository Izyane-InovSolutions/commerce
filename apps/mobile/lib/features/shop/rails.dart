import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/api_image.dart';
import '../../design/design.dart';
import '../../domain/money.dart';
import '../catalog/product_tile.dart';
import 'shop_feed.dart';

/// How wide a rail tile is: three across with a sliver of the fourth
/// showing, so it is plain there is more to the side.
double railTileWidth(BuildContext context) {
  final width = MediaQuery.sizeOf(context).width;
  const gap = Space.x3;
  final perScreen = width >= 600 ? 5.3 : 3.3;
  return ((width - Space.gutter - gap * 3) / perScreen).clamp(96.0, 180.0);
}

/// A titled row that scrolls sideways. [itemExtent] is the height of one
/// item, text included.
class Rail extends StatelessWidget {
  const Rail({
    super.key,
    required this.title,
    required this.itemCount,
    required this.itemBuilder,
    required this.itemWidth,
    required this.itemExtent,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? subtitle;
  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final double itemWidth;
  final double itemExtent;

  /// "See all", "Clear" — one action on the right of the title.
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final type = context.type;
    final colors = context.colors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x5,
            Space.x2,
            Space.x3,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(
                      header: true,
                      child: Text(title, style: type.heading),
                    ),
                    if (subtitle != null)
                      Text(
                        subtitle!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.small.copyWith(color: colors.inkMuted),
                      ),
                  ],
                ),
              ),
              if (actionLabel != null)
                Pressable(
                  onPressed: onAction,
                  focusRadius: Radii.badge,
                  builder: (context, _) => Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: Space.x3,
                      vertical: Space.x2,
                    ),
                    child: Text(
                      actionLabel!,
                      style: type.label.copyWith(color: colors.accent),
                    ),
                  ),
                ),
            ],
          ),
        ),
        SizedBox(
          height: itemExtent,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
            itemCount: itemCount,
            separatorBuilder: (_, _) => const SizedBox(width: Space.x3),
            itemBuilder: (context, i) =>
                SizedBox(width: itemWidth, child: itemBuilder(context, i)),
          ),
        ),
      ],
    );
  }
}

double _tileExtent(BuildContext context, double width) =>
    width + MediaQuery.textScalerOf(context).scale(ProductTile.textBlock);

/// A rail of products, each with the reason it is there.
class ProductRail extends StatelessWidget {
  const ProductRail({
    super.key,
    required this.title,
    required this.picks,
    this.subtitle,
    this.actionLabel,
    this.onAction,
  });

  final String title;
  final String? subtitle;
  final List<Pick> picks;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    final width = railTileWidth(context);
    return Rail(
      title: title,
      subtitle: subtitle,
      actionLabel: actionLabel,
      onAction: onAction,
      itemCount: picks.length,
      itemWidth: width,
      itemExtent: _tileExtent(context, width),
      itemBuilder: (context, i) =>
          ProductTile(product: picks[i].product, note: picks[i].note),
    );
  }
}

/// A product known only by a few stored or looked-up facts — a wishlist
/// line, a recently viewed item whose page could not be fetched.
class SimpleTile extends StatelessWidget {
  const SimpleTile({
    super.key,
    required this.name,
    required this.slug,
    this.imageUrl,
    this.price,
  });

  final String name;
  final String slug;
  final String? imageUrl;
  final Money? price;

  static double extent(BuildContext context, double width) =>
      _tileExtent(context, width);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    return Pressable(
      onPressed: () => context.push('/product/$slug'),
      focusRadius: Radii.tile,
      pressScale: 0.98,
      semanticLabel: [name, ?price?.formatted].join(', '),
      excludeChildSemantics: true,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: ClipRRect(
              borderRadius: const BorderRadius.all(Radii.tile),
              child: ApiImage(imageUrl),
            ),
          ),
          const SizedBox(height: Space.x2),
          Text(
            name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: colors.ink,
              fontSize: 13,
              height: 1.3,
            ),
          ),
          const SizedBox(height: 2),
          if (price != null)
            Price(price!.amount, price!.currency, size: PriceSize.inline),
        ],
      ),
    );
  }
}

/// Recommended sellers: a face (one of their products), their name, and
/// why they are recommended.
class SellerRail extends StatelessWidget {
  const SellerRail({super.key, required this.sellers});

  final List<SellerPick> sellers;

  @override
  Widget build(BuildContext context) {
    final width = railTileWidth(context) * 1.45;
    final scale = MediaQuery.textScalerOf(context);
    return Rail(
      title: 'Recommended sellers',
      subtitle: 'Rated well by customers, or often the lowest price',
      itemCount: sellers.length,
      itemWidth: width,
      itemExtent: width * 0.62 + scale.scale(94),
      itemBuilder: (context, i) => _SellerCard(pick: sellers[i]),
    );
  }
}

class _SellerCard extends StatelessWidget {
  const _SellerCard({required this.pick});

  final SellerPick pick;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final rating = pick.rating;
    final why = rating != null
        ? '${rating.toStringAsFixed(1)} ★ from ${pick.ratingCount} '
              '${pick.ratingCount == 1 ? 'rating' : 'ratings'}'
        : pick.bestPrices > 0
        ? 'Lowest price on ${pick.bestPrices} '
              '${pick.bestPrices == 1 ? 'item' : 'items'}'
        : '${pick.listings} ${pick.listings == 1 ? 'item' : 'items'} for sale';
    return Pressable(
      onPressed: pick.slug == null
          ? null
          : () => context.push('/seller/${pick.slug}', extra: pick.name),
      focusRadius: Radii.tile,
      pressScale: 0.98,
      semanticLabel: '${pick.name}, $why',
      excludeChildSemantics: true,
      builder: (context, _) => DecoratedBox(
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.all(Radii.tile),
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.all(Radii.tile),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AspectRatio(aspectRatio: 1 / 0.62, child: ApiImage(pick.cover)),
              Padding(
                padding: const EdgeInsets.all(Space.x3),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 22,
                          height: 22,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: colors.accentWash,
                            borderRadius: const BorderRadius.all(
                              Radius.circular(7),
                            ),
                          ),
                          child: Text(
                            pick.name.characters.first.toUpperCase(),
                            style: type.caption.copyWith(
                              color: colors.accent,
                              fontVariations: const [
                                FontVariation('wght', 720),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: Space.x2),
                        Expanded(
                          child: Text(
                            pick.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.label.copyWith(fontSize: 14),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: Space.x2),
                    Text(
                      why,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.inkMuted),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Shop by category: a photo from inside each, with its name.
class CategoryRail extends StatelessWidget {
  const CategoryRail({super.key, required this.categories});

  final List<CategoryPick> categories;

  @override
  Widget build(BuildContext context) {
    final width = railTileWidth(context) * 1.15;
    final scale = MediaQuery.textScalerOf(context);
    return Rail(
      title: 'Shop by category',
      itemCount: categories.length,
      itemWidth: width,
      itemExtent: width + scale.scale(40),
      itemBuilder: (context, i) {
        final c = categories[i];
        return Pressable(
          onPressed: () => context.push(
            '/category/${c.category.slug}',
            extra: c.category.name,
          ),
          focusRadius: Radii.tile,
          pressScale: 0.97,
          semanticLabel: c.category.name,
          excludeChildSemantics: true,
          builder: (context, _) => Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AspectRatio(
                aspectRatio: 1,
                child: ClipRRect(
                  borderRadius: const BorderRadius.all(Radius.circular(24)),
                  child: ApiImage(c.cover),
                ),
              ),
              const SizedBox(height: Space.x2),
              Text(
                c.category.name,
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.type.caption.copyWith(
                  color: context.colors.ink,
                  fontSize: 13,
                  fontVariations: const [FontVariation('wght', 600)],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
