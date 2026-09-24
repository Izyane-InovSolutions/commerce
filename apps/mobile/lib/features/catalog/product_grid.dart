import 'package:flutter/material.dart';

import '../../core/widgets/state_views.dart';
import 'product_card.dart';
import 'product_list_controller.dart';

/// A scrolling product grid over a [ProductListController], with pull to
/// refresh and loading the next page as the end comes into view.
class ProductGrid extends StatelessWidget {
  const ProductGrid({
    super.key,
    required this.controller,
    this.header = const [],
    this.emptyTitle = 'No products yet',
    this.emptyMessage,
    this.onRefresh,
  });

  final ProductListController controller;

  /// Slivers shown above the grid — they scroll with it.
  final List<Widget> header;
  final String emptyTitle;
  final String? emptyMessage;

  /// Replaces the default pull-to-refresh, which reloads only the products.
  final Future<void> Function()? onRefresh;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final products = controller.products;
        final Widget body;

        if (!controller.hasLoaded && controller.errorMessage != null) {
          body = SliverFillRemaining(
            hasScrollBody: false,
            child: ErrorView(
              message: controller.errorMessage!,
              requestId: controller.requestId,
              onRetry: controller.load,
            ),
          );
        } else if (!controller.hasLoaded) {
          body = const SliverFillRemaining(
              hasScrollBody: false, child: LoadingView());
        } else if (products.isEmpty) {
          body = SliverFillRemaining(
            hasScrollBody: false,
            child: EmptyView(
              icon: Icons.search_off_rounded,
              title: emptyTitle,
              message: emptyMessage,
            ),
          );
        } else {
          body = SliverPadding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 220,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.62,
              ),
              itemCount: products.length,
              itemBuilder: (context, index) {
                if (index >= products.length - 4) {
                  // Ask for the next page a few cards before the end.
                  WidgetsBinding.instance
                      .addPostFrameCallback((_) => controller.loadMore());
                }
                return ProductCard(product: products[index]);
              },
            ),
          );
        }

        return RefreshIndicator(
          onRefresh: onRefresh ?? controller.load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              ...header,
              body,
              if (controller.isLoadingMore)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: 24),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
