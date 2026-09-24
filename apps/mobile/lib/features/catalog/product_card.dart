import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/api_image.dart';
import '../../domain/catalog.dart';

class ProductCard extends StatelessWidget {
  const ProductCard({super.key, required this.product});

  final Product product;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final offer = product.headlineOffer;

    return Card(
      child: InkWell(
        onTap: () => context.push('/product/${product.slug}'),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AspectRatio(
              aspectRatio: 1,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  ApiImage(product.primaryImage?.url),
                  if (offer != null && !offer.inStock)
                    Positioned(
                      left: 8,
                      top: 8,
                      child: _Badge('Out of stock', theme.colorScheme.errorContainer,
                          theme.colorScheme.onErrorContainer),
                    ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 6),
                  Text(
                    offer?.price?.formatted ?? 'Unavailable',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                      color: offer?.price == null
                          ? theme.colorScheme.outline
                          : theme.colorScheme.primary,
                    ),
                  ),
                  if (product.ratingCount > 0 && product.averageRating != null) ...[
                    const SizedBox(height: 4),
                    Row(children: [
                      Icon(Icons.star_rounded, size: 16, color: Colors.amber.shade700),
                      const SizedBox(width: 2),
                      Flexible(
                        child: Text(
                          '${product.averageRating!.toStringAsFixed(1)} (${product.ratingCount})',
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodySmall,
                        ),
                      ),
                    ]),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge(this.label, this.background, this.foreground);

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
            color: background, borderRadius: BorderRadius.circular(8)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Text(label,
              style: Theme.of(context)
                  .textTheme
                  .labelSmall
                  ?.copyWith(color: foreground, fontWeight: FontWeight.w600)),
        ),
      );
}
