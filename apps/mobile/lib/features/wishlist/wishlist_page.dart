import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';

class WishlistPage extends StatefulWidget {
  const WishlistPage({super.key});

  @override
  State<WishlistPage> createState() => _WishlistPageState();
}

class _WishlistPageState extends State<WishlistPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => context.services.wishlist.refresh());
  }

  Future<void> _run(Future<void> Function() action, String done) async {
    try {
      await action();
      if (mounted) showMessage(context, done);
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    final wishlist = services.wishlist;
    return Scaffold(
      appBar: AppBar(title: const Text('Wishlist')),
      body: ListenableBuilder(
        listenable: wishlist,
        builder: (context, _) {
          final items = wishlist.items;
          if (items.isEmpty && wishlist.isLoading) return const LoadingView();
          if (items.isEmpty && wishlist.errorMessage != null) {
            return ErrorView(message: wishlist.errorMessage!, onRetry: wishlist.refresh);
          }
          if (items.isEmpty) {
            return const EmptyView(
              icon: Icons.favorite_border,
              title: 'Nothing saved yet',
              message: 'Tap the heart on a product to keep it here.',
            );
          }
          return RefreshIndicator(
            onRefresh: wishlist.refresh,
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final item = items[index];
                final offer = wishlist.offerFor(item);
                final theme = Theme.of(context);
                return Card(
                  child: ListTile(
                    contentPadding: const EdgeInsets.all(12),
                    onTap: offer == null
                        ? null
                        : () => context.push('/product/${offer.productSlug}'),
                    leading: ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: SizedBox.square(
                          dimension: 56, child: ApiImage(offer?.imageUrl)),
                    ),
                    title: Text(offer?.title ?? 'Saved item',
                        maxLines: 2, overflow: TextOverflow.ellipsis),
                    subtitle: Text(
                      !item.isAvailable
                          ? 'Currently unavailable'
                          : item.price?.formatted ?? '',
                      style: !item.isAvailable
                          ? TextStyle(color: theme.colorScheme.error)
                          : null,
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (item.isAvailable)
                          IconButton(
                            tooltip: 'Add to cart',
                            icon: const Icon(Icons.add_shopping_cart),
                            onPressed: () => _run(
                                () => services.cart.add(item.offerId),
                                'Added to your cart'),
                          ),
                        IconButton(
                          tooltip: 'Remove',
                          icon: const Icon(Icons.delete_outline),
                          onPressed: wishlist.isPending(item.offerId)
                              ? null
                              : () => _run(() => wishlist.toggle(item.offerId),
                                  'Removed from your wishlist'),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
