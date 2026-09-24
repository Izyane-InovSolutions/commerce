import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/quantity_stepper.dart';
import '../../core/widgets/state_views.dart';
import '../../domain/catalog.dart';

class ProductPage extends StatefulWidget {
  const ProductPage({super.key, required this.slug});

  final String slug;

  @override
  State<ProductPage> createState() => _ProductPageState();
}

class _ProductPageState extends State<ProductPage> {
  late final Loader<Product> _product;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _product = Loader(() => context.services.catalog.product(widget.slug));
  }

  @override
  void dispose() {
    _product.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _product,
      builder: (context, _) {
        final product = _product.data;
        return Scaffold(
          appBar: AppBar(title: Text(product?.name ?? '')),
          body: LoaderView(
            loader: _product,
            builder: (context, product) => _ProductBody(
              product: product,
              onRefresh: () => _product.load(silent: true),
            ),
          ),
        );
      },
    );
  }
}

class _ProductBody extends StatefulWidget {
  const _ProductBody({required this.product, required this.onRefresh});

  final Product product;
  final Future<void> Function() onRefresh;

  @override
  State<_ProductBody> createState() => _ProductBodyState();
}

class _ProductBodyState extends State<_ProductBody> {
  Variant? _variant;
  Offer? _offer;
  int _quantity = 1;
  bool _adding = false;

  @override
  void initState() {
    super.initState();
    _selectDefault();
  }

  @override
  void didUpdateWidget(_ProductBody oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.product != widget.product) _selectDefault();
  }

  /// Lead with the first variant that can actually be bought.
  void _selectDefault() {
    final variants = widget.product.variants;
    Variant? chosen;
    for (final variant in variants) {
      if (variant.bestOffer?.isPurchasable ?? false) {
        chosen = variant;
        break;
      }
    }
    _variant = chosen ?? (variants.isEmpty ? null : variants.first);
    _offer = _variant?.bestOffer;
  }

  Future<void> _addToCart() async {
    final offer = _offer;
    if (offer == null) return;
    final services = context.services;
    if (!services.session.isSignedIn) {
      context.push('/sign-in?from=${Uri.encodeComponent('/product/${widget.product.slug}')}');
      return;
    }
    setState(() => _adding = true);
    try {
      await services.cart.add(offer.id, quantity: _quantity);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(SnackBar(
          content: Text('Added $_quantity to your cart'),
          action: SnackBarAction(label: 'View cart', onPressed: () => context.go('/cart')),
        ));
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _toggleWishlist() async {
    final offer = _offer;
    if (offer == null) return;
    final services = context.services;
    if (!services.session.isSignedIn) {
      context.push('/sign-in?from=${Uri.encodeComponent('/product/${widget.product.slug}')}');
      return;
    }
    final saving = !services.wishlist.contains(offer.id);
    try {
      await services.wishlist.toggle(offer.id);
      if (mounted) {
        showMessage(context, saving ? 'Saved to your wishlist' : 'Removed from your wishlist');
      }
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final product = widget.product;
    final offer = _offer;

    return Column(
      children: [
        Expanded(
          child: RefreshIndicator(
            onRefresh: widget.onRefresh,
            child: ListView(
              padding: EdgeInsets.zero,
              children: [
                _Gallery(images: product.images),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (product.category != null)
                        Text(product.category!.name.toUpperCase(),
                            style: theme.textTheme.labelMedium
                                ?.copyWith(color: theme.colorScheme.primary)),
                      const SizedBox(height: 4),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(
                            child: Text(product.name,
                                style: theme.textTheme.headlineSmall),
                          ),
                          if (offer != null)
                            ListenableBuilder(
                              listenable: context.services.wishlist,
                              builder: (context, _) {
                                final wishlist = context.services.wishlist;
                                final saved = wishlist.contains(offer.id);
                                return IconButton(
                                  tooltip: saved ? 'Remove from wishlist' : 'Save to wishlist',
                                  onPressed: wishlist.isPending(offer.id) ? null : _toggleWishlist,
                                  icon: Icon(saved ? Icons.favorite : Icons.favorite_border,
                                      color: saved ? theme.colorScheme.error : null),
                                );
                              },
                            ),
                        ],
                      ),
                      if (product.ratingCount > 0 && product.averageRating != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Row(children: [
                            Icon(Icons.star_rounded, color: Colors.amber.shade700, size: 20),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text('${product.averageRating!.toStringAsFixed(1)} · '
                                  '${product.ratingCount} ${product.ratingCount == 1 ? 'review' : 'reviews'}'),
                            ),
                          ]),
                        ),
                      const SizedBox(height: 12),
                      Text(
                        offer?.price?.formatted ?? 'Currently unavailable',
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: offer?.price == null ? theme.colorScheme.outline : null,
                        ),
                      ),
                      if (offer != null) ...[
                        const SizedBox(height: 4),
                        Text(offer.sellerName, style: theme.textTheme.bodyMedium),
                        if (!offer.inStock)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('Out of stock',
                                style: TextStyle(color: theme.colorScheme.error,
                                    fontWeight: FontWeight.w600)),
                          ),
                        if (offer.shippingCost != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 4),
                            child: Text('Shipping from ${offer.shippingCost!.formatted}',
                                style: theme.textTheme.bodySmall),
                          ),
                      ],
                      if (product.variants.length > 1) ...[
                        const SizedBox(height: 20),
                        Text('Options', style: theme.textTheme.titleSmall),
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            for (final variant in product.variants)
                              ChoiceChip(
                                label: Text(variant.label),
                                selected: variant.id == _variant?.id,
                                onSelected: (_) => setState(() {
                                  _variant = variant;
                                  _offer = variant.bestOffer;
                                }),
                              ),
                          ],
                        ),
                      ],
                      if ((_variant?.offers.where((o) => o.price != null).length ?? 0) > 1) ...[
                        const SizedBox(height: 20),
                        Text('Choose a seller', style: theme.textTheme.titleSmall),
                        const SizedBox(height: 8),
                        RadioGroup<String>(
                          groupValue: _offer?.id,
                          onChanged: (id) => setState(() => _offer =
                              _variant!.offers.firstWhere((o) => o.id == id)),
                          child: Column(
                            children: [
                              for (final candidate in _variant!.offers.where((o) => o.price != null))
                                RadioListTile<String>(
                                  contentPadding: EdgeInsets.zero,
                                  value: candidate.id,
                                  enabled: candidate.inStock,
                                  title: Text(candidate.price!.formatted),
                                  subtitle: Text(candidate.inStock
                                      ? candidate.sellerName
                                      : '${candidate.sellerName} · out of stock'),
                                ),
                            ],
                          ),
                        ),
                      ],
                      if (product.isReturnable) ...[
                        const SizedBox(height: 16),
                        Row(children: [
                          Icon(Icons.assignment_return_outlined,
                              size: 18, color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(product.returnWindowDays == null
                                ? 'Returns accepted'
                                : 'Returnable within ${product.returnWindowDays} days'),
                          ),
                        ]),
                      ],
                      if (product.description != null && product.description!.trim().isNotEmpty) ...[
                        const SizedBox(height: 20),
                        Text('About this product', style: theme.textTheme.titleSmall),
                        const SizedBox(height: 8),
                        Text(product.description!, style: theme.textTheme.bodyMedium),
                      ],
                      const SizedBox(height: 24),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
            child: Row(
              children: [
                QuantityStepper(
                  value: _quantity,
                  enabled: offer?.isPurchasable ?? false,
                  onChanged: (value) => setState(() => _quantity = value),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: (offer?.isPurchasable ?? false) && !_adding ? _addToCart : null,
                    icon: _adding
                        ? const SizedBox.square(
                            dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.add_shopping_cart),
                    label: Text(offer == null
                        ? 'Unavailable'
                        : offer.inStock
                            ? 'Add to cart'
                            : 'Out of stock'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.images});

  final List<ProductImage> images;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    if (images.isEmpty) {
      return const AspectRatio(aspectRatio: 1, child: ApiImage(null));
    }
    return AspectRatio(
      aspectRatio: 1,
      child: Stack(
        children: [
          PageView.builder(
            itemCount: images.length,
            onPageChanged: (index) => setState(() => _index = index),
            itemBuilder: (context, index) =>
                ApiImage(images[index].url, fit: BoxFit.contain),
          ),
          if (images.length > 1)
            Positioned(
              bottom: 12,
              left: 0,
              right: 0,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  for (var i = 0; i < images.length; i++)
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: i == _index ? 18 : 7,
                      height: 7,
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .primary
                            .withValues(alpha: i == _index ? 1 : 0.35),
                        borderRadius: BorderRadius.circular(4),
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
