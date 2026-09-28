import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/network/api_exception.dart';
import '../../core/state/loader.dart';
import '../../core/widgets/api_image.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
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
    return LoaderView(
      loader: _product,
      placeholder: const PageScaffold(
        title: '',
        largeTitle: false,
        body: _ProductSkeleton(),
      ),
      builder: (context, product) => _ProductBody(
        product: product,
        onRefresh: () => _product.load(silent: true),
      ),
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
    // Remembered once it has loaded, for "recently viewed" on the Shop tab.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.services.history.viewedProduct(widget.product);
    });
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

  String get _here => '/product/${widget.product.slug}';

  bool _requireSignIn() {
    if (context.services.session.isSignedIn) return false;
    context.push('/sign-in?from=${Uri.encodeComponent(_here)}');
    return true;
  }

  Future<void> _addToCart() async {
    final offer = _offer;
    if (offer == null || _requireSignIn()) return;
    setState(() => _adding = true);
    try {
      await context.services.cart.add(offer.id, quantity: _quantity);
      if (!mounted) return;
      showMessage(
        context,
        _quantity == 1 ? 'Added to your cart' : 'Added $_quantity to your cart',
        actionLabel: 'View cart',
        onAction: () => context.go('/cart'),
      );
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _toggleWishlist() async {
    final offer = _offer;
    if (offer == null || _requireSignIn()) return;
    final wishlist = context.services.wishlist;
    final saving = !wishlist.contains(offer.id);
    try {
      await wishlist.toggle(offer.id);
      if (mounted) {
        showMessage(
          context,
          saving ? 'Saved to your wishlist' : 'Removed from your wishlist',
        );
      }
    } on ApiException catch (error) {
      if (mounted) showMessage(context, error.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final product = widget.product;
    final offer = _offer;
    final wishlist = context.services.wishlist;
    final pricedOffers =
        _variant?.offers.where((o) => o.price != null).toList() ??
        const <Offer>[];

    return PageScaffold(
      title: '',
      largeTitle: false,
      onRefresh: widget.onRefresh,
      actions: [
        if (offer != null)
          ListenableBuilder(
            listenable: wishlist,
            builder: (context, _) {
              final saved = wishlist.contains(offer.id);
              return IconAction(
                icon: Glyphs.heart,
                active: saved,
                color: saved ? colors.danger : null,
                semanticLabel: saved
                    ? 'Remove from wishlist'
                    : 'Save to wishlist',
                haptic: Haptic.light,
                onPressed: wishlist.isPending(offer.id)
                    ? null
                    : _toggleWishlist,
              );
            },
          ),
      ],
      bottomBar: Row(
        children: [
          QuantityStepper(
            value: _quantity,
            enabled: offer?.isPurchasable ?? false,
            onChanged: (value) => setState(() => _quantity = value),
          ),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Button(
              label: offer == null
                  ? 'Unavailable'
                  : offer.inStock
                  ? 'Add to cart'
                  : 'Out of stock',
              icon: Glyphs.bagAdd,
              loading: _adding,
              haptic: Haptic.medium,
              onPressed: (offer?.isPurchasable ?? false) ? _addToCart : null,
            ),
          ),
        ],
      ),
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: Space.x3)),
        SliverToBoxAdapter(
          child: _Gallery(images: product.images, name: product.name),
        ),
        SliverPadding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x5,
            Space.gutter,
            0,
          ),
          sliver: SliverList.list(
            children: [
              if (product.category != null)
                Text(
                  product.category!.name,
                  style: type.small.copyWith(
                    color: colors.accent,
                    fontVariations: const [FontVariation('wght', 600)],
                  ),
                ),
              const SizedBox(height: Space.x1),
              Semantics(
                header: true,
                child: Text(product.name, style: type.title),
              ),
              if (product.ratingCount > 0 && product.averageRating != null) ...[
                const SizedBox(height: Space.x2),
                Row(
                  children: [
                    Glyph(Glyphs.star, color: colors.star, size: 19),
                    const SizedBox(width: Space.x1),
                    Flexible(
                      child: Text(
                        '${product.averageRating!.toStringAsFixed(1)} '
                        '(${product.ratingCount} ${product.ratingCount == 1 ? 'review' : 'reviews'})',
                        style: type.small.copyWith(color: colors.inkMuted),
                      ),
                    ),
                  ],
                ),
              ],
              const SizedBox(height: Space.x5),
              if (offer?.price != null)
                Price(
                  offer!.price!.amount,
                  offer.price!.currency,
                  size: PriceSize.hero,
                )
              else
                Text(
                  'Not currently sold in kwacha',
                  style: type.heading.copyWith(color: colors.inkMuted),
                ),
              if (offer != null) ...[
                const SizedBox(height: Space.x2),
                Wrap(
                  spacing: Space.x2,
                  runSpacing: Space.x1,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    if (offer.seller?.slug case final slug?
                        when !offer.isFirstParty)
                      // The seller's name leads to their shop.
                      Pressable(
                        onPressed: () => context.push(
                          '/seller/$slug',
                          extra: offer.seller?.displayName,
                        ),
                        focusRadius: Radii.badge,
                        semanticLabel: '${offer.sellerName}, see their shop',
                        excludeChildSemantics: true,
                        builder: (context, _) => Text(
                          '${offer.sellerName} ›',
                          style: type.small.copyWith(
                            color: colors.accent,
                            fontVariations: const [FontVariation('wght', 600)],
                          ),
                        ),
                      )
                    else
                      Text(
                        offer.sellerName,
                        style: type.small.copyWith(color: colors.inkMuted),
                      ),
                    if (!offer.inStock)
                      const StatusBadge('Out of stock', tone: Tone.danger),
                  ],
                ),
                if (offer.shippingCost != null) ...[
                  const SizedBox(height: Space.x1),
                  Text(
                    'Delivery from ${offer.shippingCost!.formatted}',
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
                ],
              ],
              if (product.variants.length > 1) ...[
                const SizedBox(height: Space.x6),
                Text('Options', style: type.label),
                const SizedBox(height: Space.x3),
                Wrap(
                  spacing: Space.x2,
                  runSpacing: Space.x2,
                  children: [
                    for (final variant in product.variants)
                      SelectChip(
                        label: variant.label,
                        selected: variant.id == _variant?.id,
                        onPressed: () => setState(() {
                          _variant = variant;
                          _offer = variant.bestOffer;
                        }),
                      ),
                  ],
                ),
              ],
              if (pricedOffers.length > 1) ...[
                const SizedBox(height: Space.x6),
                InsetGroup(
                  title: 'Sold by ${pricedOffers.length} sellers',
                  children: [
                    for (final candidate in pricedOffers)
                      ListRow(
                        title: candidate.sellerName.replaceFirst(
                          'Sold by ',
                          '',
                        ),
                        subtitle: candidate.inStock ? null : 'Out of stock',
                        trailing: Price(
                          candidate.price!.amount,
                          candidate.price!.currency,
                          size: PriceSize.inline,
                        ),
                        selected: candidate.id == _offer?.id,
                        onPressed: candidate.inStock
                            ? () => setState(() => _offer = candidate)
                            : null,
                      ),
                  ],
                ),
              ],
              if (product.isReturnable) ...[
                const SizedBox(height: Space.x6),
                Row(
                  children: [
                    Glyph(Glyphs.returnItem, size: 20, color: colors.inkMuted),
                    const SizedBox(width: Space.x3),
                    Expanded(
                      child: Text(
                        product.returnWindowDays == null
                            ? 'Returns accepted'
                            : 'Free to return within ${product.returnWindowDays} days',
                        style: type.small,
                      ),
                    ),
                  ],
                ),
              ],
              if (product.description != null &&
                  product.description!.trim().isNotEmpty) ...[
                const SizedBox(height: Space.x6),
                Text('About this product', style: type.label),
                const SizedBox(height: Space.x2),
                Text(
                  product.description!,
                  style: type.body.copyWith(color: colors.inkMuted),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _Gallery extends StatefulWidget {
  const _Gallery({required this.images, required this.name});

  final List<ProductImage> images;
  final String name;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final images = widget.images;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
      child: AspectRatio(
        aspectRatio: 1,
        child: ClipRRect(
          borderRadius: const BorderRadius.all(Radii.group),
          child: images.isEmpty
              ? const ApiImage(null)
              : Stack(
                  children: [
                    PageView.builder(
                      itemCount: images.length,
                      onPageChanged: (index) => setState(() => _index = index),
                      itemBuilder: (context, index) => ApiImage(
                        images[index].url,
                        fit: BoxFit.contain,
                        semanticLabel:
                            '${widget.name}, image ${index + 1} of ${images.length}',
                      ),
                    ),
                    if (images.length > 1)
                      Positioned(
                        bottom: Space.x3,
                        left: 0,
                        right: 0,
                        child: ExcludeSemantics(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              for (var i = 0; i < images.length; i++)
                                AnimatedContainer(
                                  duration: Motion.base,
                                  margin: const EdgeInsets.symmetric(
                                    horizontal: 3,
                                  ),
                                  width: i == _index ? 18 : 6,
                                  height: 6,
                                  decoration: BoxDecoration(
                                    color: colors.ink.withValues(
                                      alpha: i == _index ? 0.75 : 0.25,
                                    ),
                                    borderRadius: const BorderRadius.all(
                                      Radius.circular(3),
                                    ),
                                  ),
                                ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
        ),
      ),
    );
  }
}

class _ProductSkeleton extends StatelessWidget {
  const _ProductSkeleton();

  @override
  Widget build(BuildContext context) => const Padding(
    padding: EdgeInsets.all(Space.gutter),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AspectRatio(aspectRatio: 1, child: Skeleton(radius: Radii.group)),
        SizedBox(height: Space.x6),
        Skeleton(width: 80),
        SizedBox(height: Space.x3),
        Skeleton(width: 240, height: 24),
        SizedBox(height: Space.x5),
        Skeleton(width: 150, height: 36),
      ],
    ),
  );
}
