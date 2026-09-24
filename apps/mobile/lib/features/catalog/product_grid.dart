import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';

import '../../design/design.dart';
import 'product_list_controller.dart';
import 'product_tile.dart';

/// The product grid, as a sliver for a [PageScaffold]. Loads the next page
/// as the last few tiles come into view.
class ProductGridSliver extends StatelessWidget {
  const ProductGridSliver({
    super.key,
    required this.controller,
    this.emptyTitle = 'No products here yet',
    this.emptyMessage,
  });

  final ProductListController controller;
  final String emptyTitle;
  final String? emptyMessage;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final products = controller.products;

        if (!controller.hasLoaded && controller.errorMessage != null) {
          return SliverFillRemaining(
            hasScrollBody: false,
            child: ErrorState(
              message: controller.errorMessage!,
              requestId: controller.requestId,
              onRetry: controller.load,
            ),
          );
        }
        if (controller.hasLoaded && products.isEmpty) {
          return SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyState(
              icon: Icons.search_off_rounded,
              title: emptyTitle,
              message: emptyMessage,
            ),
          );
        }

        final loading = !controller.hasLoaded;
        return SliverMainAxisGroup(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              sliver: SliverLayoutBuilder(
                builder: (context, constraints) {
                  const gap = Space.x4;
                  final width = (constraints.crossAxisExtent - gap) / 2;
                  // Square image plus the text block, grown with the user's text
                  // size so a larger font never overflows the tile.
                  final extent =
                      width +
                      MediaQuery.textScalerOf(
                        context,
                      ).scale(ProductTile.textBlock);
                  return SliverGrid.builder(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      crossAxisSpacing: gap,
                      mainAxisSpacing: Space.x6,
                      mainAxisExtent: extent,
                    ),
                    itemCount: loading ? 4 : products.length,
                    itemBuilder: (context, index) {
                      if (loading) return const ProductTileSkeleton();
                      if (index >= products.length - 4) {
                        WidgetsBinding.instance.addPostFrameCallback(
                          (_) => controller.loadMore(),
                        );
                      }
                      return ProductTile(product: products[index]);
                    },
                  );
                },
              ),
            ),
            if (controller.isLoadingMore)
              const SliverToBoxAdapter(
                child: Padding(
                  padding: EdgeInsets.symmetric(vertical: Space.x6),
                  child: Center(child: Spinner()),
                ),
              ),
          ],
        );
      },
    );
  }
}
