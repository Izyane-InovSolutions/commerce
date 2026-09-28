import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/cart.dart';
import '../auth/sign_in_prompt.dart';

class CartPage extends StatelessWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    return ListenableBuilder(
      listenable: Listenable.merge([services.session, services.cart]),
      builder: (context, _) {
        final controller = services.cart;
        final cart = controller.cart;
        final signedIn = services.session.isSignedIn;

        Widget? fill;
        if (!signedIn) {
          fill = const SignInPrompt(
            icon: Glyphs.bag,
            title: 'Your cart lives in your account',
            message: 'Sign in to add things and check out with mobile money.',
            from: '/cart',
          );
        } else if (cart.isEmpty && controller.isLoading) {
          fill = const LoadingState();
        } else if (cart.isEmpty && controller.errorMessage != null) {
          fill = ErrorState(
            message: controller.errorMessage!,
            onRetry: controller.refresh,
          );
        } else if (cart.isEmpty) {
          fill = EmptyState(
            icon: Glyphs.bag,
            title: 'Your cart is empty',
            message: 'Anything you add shows up here.',
            action: Button(
              label: 'Browse the shop',
              variant: ButtonVariant.secondary,
              expand: false,
              onPressed: () => context.go('/'),
            ),
          );
        }

        return PageScaffold(
          title: 'Cart',
          showBack: false,
          onRefresh: signedIn ? controller.refresh : null,
          bottomBar: fill == null ? _CheckoutBar(cart: cart) : null,
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
                  itemCount: cart.items.length,
                  separatorBuilder: (_, _) => Padding(
                    padding: const EdgeInsets.symmetric(vertical: Space.x4),
                    child: Container(height: 0.8, color: context.colors.line),
                  ),
                  itemBuilder: (context, index) =>
                      _CartLine(line: cart.items[index]),
                ),
              ),
          ],
        );
      },
    );
  }
}

class _CartLine extends StatelessWidget {
  const _CartLine({required this.line});

  final CartLine line;

  Future<void> _run(
    BuildContext context,
    Future<void> Function() action,
  ) async {
    try {
      await action();
    } on ApiException catch (error) {
      if (context.mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final controller = context.services.cart;
    final offer = controller.offerFor(line);
    final busy = controller.isBusy(line);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Pressable(
          onPressed: offer == null
              ? null
              : () => context.push('/product/${offer.productSlug}'),
          semanticLabel: offer == null ? null : 'Open ${offer.title}',
          focusRadius: Radii.tile,
          builder: (context, _) => ClipRRect(
            borderRadius: const BorderRadius.all(Radii.tile),
            child: SizedBox.square(
              dimension: 84,
              child: ApiImage(offer?.imageUrl),
            ),
          ),
        ),
        const SizedBox(width: Space.x4),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                offer?.title ?? 'Item',
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.bodyStrong,
              ),
              const SizedBox(height: Space.x1),
              if (line.unitPrice != null)
                Price(
                  line.lineTotal,
                  line.unitPrice!.currency,
                  size: PriceSize.inline,
                ),
              if (line.quantity > 1 && line.unitPrice != null)
                Text(
                  '${line.unitPrice!.formatted} each',
                  style: type.caption.copyWith(color: colors.inkMuted),
                ),
              if (!line.isAvailable) ...[
                const SizedBox(height: Space.x2),
                const StatusBadge('No longer available', tone: Tone.danger),
                const SizedBox(height: Space.x1),
                Text(
                  'Remove it to check out.',
                  style: type.caption.copyWith(color: colors.danger),
                ),
              ],
              const SizedBox(height: Space.x3),
              Row(
                children: [
                  QuantityStepper(
                    value: line.quantity,
                    enabled: !busy && line.isAvailable,
                    onChanged: (quantity) => _run(
                      context,
                      () => controller.setQuantity(line, quantity),
                    ),
                  ),
                  const Spacer(),
                  busy
                      ? const Padding(
                          padding: EdgeInsets.all(Space.x3),
                          child: Spinner(size: 20),
                        )
                      : IconAction(
                          icon: Glyphs.trash,
                          semanticLabel: 'Remove ${offer?.title ?? 'item'}',
                          color: colors.inkMuted,
                          onPressed: () =>
                              _run(context, () => controller.remove(line)),
                        ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _CheckoutBar extends StatelessWidget {
  const _CheckoutBar({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final type = context.type;
    final colors = context.colors;
    final blocked = cart.hasUnavailable;
    final subtotal = cart.subtotalMoney;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Subtotal, ${cart.itemCount} ${cart.itemCount == 1 ? 'item' : 'items'}',
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
                  Text(
                    'Delivery is added at checkout',
                    style: type.caption.copyWith(color: colors.inkSubtle),
                  ),
                ],
              ),
            ),
            if (subtotal != null)
              Price(subtotal.amount, subtotal.currency, size: PriceSize.total),
          ],
        ),
        const SizedBox(height: Space.x3),
        Button(
          label: blocked ? 'Remove unavailable items first' : 'Check out',
          onPressed: blocked ? null : () => context.push('/checkout'),
        ),
      ],
    );
  }
}
