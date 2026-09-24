import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/util/money.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/quantity_stepper.dart';
import '../../core/widgets/state_views.dart';
import '../../domain/cart.dart';
import '../auth/sign_in_prompt.dart';

class CartPage extends StatelessWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    return Scaffold(
      appBar: AppBar(title: const Text('Cart')),
      body: ListenableBuilder(
        listenable: Listenable.merge([services.session, services.cart]),
        builder: (context, _) {
          if (!services.session.isSignedIn) {
            return const SignInPrompt(
              icon: Icons.shopping_cart_outlined,
              title: 'Your cart lives in your account',
              message: 'Sign in to add items and check out.',
              from: '/cart',
            );
          }
          final controller = services.cart;
          final cart = controller.cart;

          if (cart.isEmpty && controller.isLoading) return const LoadingView();
          if (cart.isEmpty && controller.errorMessage != null) {
            return ErrorView(
                message: controller.errorMessage!, onRetry: controller.refresh);
          }
          if (cart.isEmpty) {
            return EmptyView(
              icon: Icons.shopping_cart_outlined,
              title: 'Your cart is empty',
              message: 'Anything you add shows up here.',
              action: FilledButton.tonal(
                onPressed: () => context.go('/'),
                child: const Text('Start shopping'),
              ),
            );
          }

          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: controller.refresh,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16),
                    itemCount: cart.items.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) =>
                        _CartLineTile(line: cart.items[index]),
                  ),
                ),
              ),
              _CartSummary(cart: cart),
            ],
          );
        },
      ),
    );
  }
}

class _CartLineTile extends StatelessWidget {
  const _CartLineTile({required this.line});

  final CartLine line;

  Future<void> _run(BuildContext context, Future<void> Function() action) async {
    try {
      await action();
    } on ApiException catch (error) {
      if (context.mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final controller = context.services.cart;
    final offer = controller.offerFor(line);
    final busy = controller.isBusy(line);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            InkWell(
              onTap: offer == null ? null : () => context.push('/product/${offer.productSlug}'),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox.square(dimension: 76, child: ApiImage(offer?.imageUrl)),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(offer?.title ?? 'Item',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall),
                  if (line.unitPrice != null)
                    Text('${line.unitPrice!.formatted} each',
                        style: theme.textTheme.bodySmall),
                  if (!line.isAvailable)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text('No longer available — remove it to check out',
                          style: theme.textTheme.bodySmall?.copyWith(
                              color: theme.colorScheme.error,
                              fontWeight: FontWeight.w600)),
                    ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      QuantityStepper(
                        value: line.quantity,
                        enabled: !busy && line.isAvailable,
                        onChanged: (quantity) =>
                            _run(context, () => controller.setQuantity(line, quantity)),
                      ),
                      const Spacer(),
                      IconButton(
                        tooltip: 'Remove',
                        onPressed: busy ? null : () => _run(context, () => controller.remove(line)),
                        icon: busy
                            ? const SizedBox.square(
                                dimension: 18,
                                child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              line.unitPrice == null
                  ? '—'
                  : formatMoney(line.lineTotal, line.unitPrice!.currency),
              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
            ),
          ],
        ),
      ),
    );
  }
}

class _CartSummary extends StatelessWidget {
  const _CartSummary({required this.cart});

  final Cart cart;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final blocked = cart.hasUnavailable;
    return Material(
      elevation: 8,
      color: theme.colorScheme.surfaceContainer,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text('Subtotal (${cart.itemCount} ${cart.itemCount == 1 ? 'item' : 'items'})',
                        style: theme.textTheme.bodyLarge),
                  ),
                  Text(cart.subtotalMoney?.formatted ?? '—',
                      style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                ],
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: Text('Shipping is calculated at checkout.',
                    style: theme.textTheme.bodySmall),
              ),
              const SizedBox(height: 12),
              FilledButton(
                onPressed: blocked ? null : () => context.push('/checkout'),
                child: Text(blocked ? 'Remove unavailable items to continue' : 'Checkout'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
