import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/api_image.dart';
import '../../design/design.dart';
import '../../domain/catalog.dart';

/// A product in a grid. No card around it: the image sits on its own tile
/// and the words sit on the page, so a screen of products reads as goods on
/// a shelf rather than a stack of identical boxes.
class ProductTile extends StatelessWidget {
  const ProductTile({super.key, required this.product});

  final Product product;

  /// Height of everything under the square image, at 1× text. The grid adds
  /// this to the tile's width, scaled by the user's text size.
  static const textBlock = 98.0;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final offer = product.headlineOffer;
    final price = offer?.price;

    return Pressable(
      onPressed: () => context.push('/product/${product.slug}'),
      focusRadius: Radii.tile,
      pressScale: 0.98,
      semanticLabel: [
        product.name,
        price?.formatted ?? 'unavailable',
        if (offer != null && !offer.inStock) 'out of stock',
      ].join(', '),
      excludeChildSemantics: true,
      builder: (context, _) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AspectRatio(
            aspectRatio: 1,
            child: ClipRRect(
              borderRadius: const BorderRadius.all(Radii.tile),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ApiImage(product.primaryImage?.url),
                  if (offer != null && !offer.inStock)
                    const Positioned(
                      left: Space.x2,
                      top: Space.x2,
                      child: StatusBadge('Out of stock', tone: Tone.danger),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Space.x3 - 2),
          Text(
            product.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: type.small.copyWith(color: colors.ink, height: 1.3),
          ),
          const SizedBox(height: Space.x1),
          if (price != null)
            Price(price.amount, price.currency, size: PriceSize.tile)
          else
            Text(
              'Not sold in kwacha',
              style: type.small.copyWith(color: colors.inkSubtle),
            ),
          if (product.ratingCount > 0 && product.averageRating != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                children: [
                  Glyph(Glyphs.star, size: 15, color: colors.star),
                  const SizedBox(width: 3),
                  Flexible(
                    child: Text(
                      '${product.averageRating!.toStringAsFixed(1)} (${product.ratingCount})',
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.inkMuted),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

/// A tile's shape with nothing in it yet, so the grid does not jump when
/// products arrive.
class ProductTileSkeleton extends StatelessWidget {
  const ProductTileSkeleton({super.key});

  @override
  Widget build(BuildContext context) => const Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      AspectRatio(aspectRatio: 1, child: Skeleton(radius: Radii.tile)),
      SizedBox(height: Space.x3),
      Skeleton(height: 13),
      SizedBox(height: Space.x2),
      Skeleton(width: 90, height: 13),
      SizedBox(height: Space.x3),
      Skeleton(width: 70, height: 18),
    ],
  );
}
