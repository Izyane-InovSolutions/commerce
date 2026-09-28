import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/api_image.dart';
import '../../design/design.dart';
import '../../domain/catalog.dart';

/// A product in a grid. No card around it: the image sits on its own tile
/// and the words sit on the page, so a screen of products reads as goods on
/// a shelf rather than a stack of identical boxes.
///
/// Sized for three across a phone: the name gets two lines of small text,
/// the price stays the loudest thing, and one [note] line can say why the
/// product is shown — "K200 less than elsewhere", "Free delivery".
class ProductTile extends StatelessWidget {
  const ProductTile({super.key, required this.product, this.note});

  final Product product;
  final String? note;

  /// Height of everything under the square image, at 1× text. Grids and
  /// rails add this to the tile's width, scaled by the user's text size.
  static const textBlock = 92.0;

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
        ?note,
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
                      left: Space.x1,
                      top: Space.x1,
                      child: StatusBadge('Sold out', tone: Tone.danger),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(height: Space.x2),
          Text(
            product.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: colors.ink,
              fontSize: 13,
              height: 1.3,
              fontVariations: const [FontVariation('wght', 460)],
            ),
          ),
          const SizedBox(height: 2),
          if (price != null)
            Price(price.amount, price.currency, size: PriceSize.inline)
          else
            Text(
              'Not sold in kwacha',
              style: type.caption.copyWith(color: colors.inkSubtle),
            ),
          if (note != null)
            Text(
              note!,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(
                color: colors.accent,
                fontVariations: const [FontVariation('wght', 620)],
              ),
            ),
          if (product.ratingCount > 0 && product.averageRating != null)
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Row(
                children: [
                  Glyph(Glyphs.star, size: 13, color: colors.star),
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
      SizedBox(height: Space.x2),
      Skeleton(height: 11),
      SizedBox(height: Space.x2),
      Skeleton(width: 60, height: 11),
      SizedBox(height: Space.x2),
      Skeleton(width: 50, height: 15),
    ],
  );
}
