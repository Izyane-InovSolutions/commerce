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
              icon: Glyphs.searchOff,
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
                  const gap = Space.x3;
                  // Three across a phone, more on a tablet; never tiles so
                  // small the names become unreadable.
                  final columns = (constraints.crossAxisExtent / 120)
                      .floor()
                      .clamp(3, 6);
                  final width =
                      (constraints.crossAxisExtent - gap * (columns - 1)) /
                      columns;
                  // Square image plus the text block, grown with the user's text
                  // size so a larger font never overflows the tile.
                  final extent =
                      width +
                      MediaQuery.textScalerOf(
                        context,
                      ).scale(ProductTile.textBlock);
                  return SliverGrid.builder(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: columns,
                      crossAxisSpacing: gap,
                      mainAxisSpacing: Space.x5,
                      mainAxisExtent: extent,
                    ),
                    itemCount: loading ? 6 : products.length,
                    itemBuilder: (context, index) {
                      if (loading) return const ProductTileSkeleton();
                      if (index >= products.length - 6) {
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
