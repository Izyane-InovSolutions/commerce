import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';

class WishlistPage extends StatefulWidget {
  const WishlistPage({super.key});

  @override
  State<WishlistPage> createState() => _WishlistPageState();
}

class _WishlistPageState extends State<WishlistPage> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback(
      (_) => context.services.wishlist.refresh(),
    );
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
    return ListenableBuilder(
      listenable: wishlist,
      builder: (context, _) {
        final items = wishlist.items;
        final colors = context.colors;
        final type = context.type;

        Widget? fill;
        if (items.isEmpty && wishlist.isLoading) {
          fill = const LoadingState();
        } else if (items.isEmpty && wishlist.errorMessage != null) {
          fill = ErrorState(
            message: wishlist.errorMessage!,
            onRetry: wishlist.refresh,
          );
        } else if (items.isEmpty) {
          fill = const EmptyState(
            icon: Glyphs.heart,
            title: 'Nothing saved yet',
            message: 'Tap the heart on a product to keep it here for later.',
          );
        }

        return PageScaffold(
          title: 'Wishlist',
          onRefresh: wishlist.refresh,
          slivers: [
            if (fill != null)
              SliverFillRemaining(hasScrollBody: false, child: fill)
            else
              SliverPadding(
                padding: const EdgeInsets.fromLTRB(
                  Space.gutter,
                  Space.x3,
                  Space.gutter,
                  0,
                ),
                sliver: SliverList.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => const SizedBox(height: Space.x5),
                  itemBuilder: (context, index) {
                    final item = items[index];
                    final offer = wishlist.offerFor(item);
                    return Pressable(
                      onPressed: offer == null
                          ? null
                          : () => context.push('/product/${offer.productSlug}'),
                      pressScale: 0.99,
                      focusRadius: Radii.tile,
                      builder: (context, _) => Row(
                        children: [
                          ClipRRect(
                            borderRadius: const BorderRadius.all(Radii.tile),
                            child: SizedBox.square(
                              dimension: 72,
                              child: ApiImage(offer?.imageUrl),
                            ),
                          ),
                          const SizedBox(width: Space.x4),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  offer?.title ?? 'Saved item',
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: type.bodyStrong,
                                ),
                                const SizedBox(height: Space.x1),
                                if (!item.isAvailable)
                                  const StatusBadge(
                                    'Unavailable right now',
                                    tone: Tone.danger,
                                  )
                                else if (item.price != null)
                                  Price(
                                    item.price!.amount,
                                    item.price!.currency,
                                    size: PriceSize.inline,
                                  ),
                              ],
                            ),
                          ),
                          if (item.isAvailable)
                            IconAction(
                              icon: Glyphs.bagAdd,
                              semanticLabel:
                                  'Add ${offer?.title ?? 'item'} to cart',
                              variant: IconButtonVariant.tinted,
                              haptic: Haptic.light,
                              onPressed: () => _run(
                                () => services.cart.add(item.offerId),
                                'Added to your cart',
                              ),
                            ),
                          IconAction(
                            icon: Glyphs.close,
                            semanticLabel:
                                'Remove ${offer?.title ?? 'item'} from wishlist',
                            color: colors.inkMuted,
                            onPressed: wishlist.isPending(item.offerId)
                                ? null
                                : () => _run(
                                    () => wishlist.toggle(item.offerId),
                                    'Removed from your wishlist',
                                  ),
                          ),
                        ],
                      ),
                    );
                  },
                ),
              ),
          ],
        );
      },
    );
  }
}
