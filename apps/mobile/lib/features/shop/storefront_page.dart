import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../core/util/dates.dart';
import '../../core/widgets/state_views.dart';
import '../../design/design.dart';
import '../../domain/catalog.dart';
import '../../data/catalog_repository.dart';
import '../catalog/filter_sheet.dart';
import '../catalog/product_filters.dart';
import '../catalog/product_grid.dart';
import '../catalog/product_list_controller.dart';
import '../catalog/sort_button.dart';

/// A seller's shop, as a customer sees it: who they are, what customers
/// say, and what they sell.
class StorefrontPage extends StatefulWidget {
  const StorefrontPage({super.key, required this.slug, this.name});

  final String slug;

  /// Known from where it was opened, so the title shows at once.
  final String? name;

  @override
  State<StorefrontPage> createState() => _StorefrontPageState();
}

class _StorefrontPageState extends State<StorefrontPage> {
  late final Loader<(Storefront, List<StorefrontRating>)> _shop;
  ProductListController? _products;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final catalog = context.services.catalog;
    _shop = Loader(() async {
      final shop = await catalog.storefront(widget.slug);
      final ratings = await catalog
          .storefrontRatings(widget.slug)
          .catchError((_) => const <StorefrontRating>[]);
      if (_products == null) {
        _products = ProductListController(
          catalog,
          query: ProductQuery(search: shop.name),
          filters: ProductFilters(sellerId: shop.id),
        );
        _products!.load();
      }
      return (shop, ratings);
    });
  }

  @override
  void dispose() {
    _shop.dispose();
    _products?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: _shop,
      builder: (context, _) {
        final data = _shop.data;
        final products = _products;
        return PageScaffold(
          title: data?.$1.name ?? widget.name ?? 'Seller',
          onRefresh: () => _shop.load(silent: true),
          actions: [
            if (products != null)
              ListenableBuilder(
                listenable: products,
                builder: (context, _) => SortButton(products: products),
              ),
          ],
          slivers: [
            LoaderSliver(
              loader: _shop,
              builder: (context, data) => SliverToBoxAdapter(
                child: _Header(shop: data.$1, ratings: data.$2),
              ),
            ),
            if (products != null) ...[
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(
                    Space.gutter,
                    Space.x6,
                    Space.gutter,
                    Space.x3,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text('For sale', style: context.type.heading),
                      ),
                      ListenableBuilder(
                        listenable: products,
                        builder: (context, _) =>
                            FiltersChip(products: products),
                      ),
                    ],
                  ),
                ),
              ),
              ProductGridSliver(
                controller: products,
                emptyTitle: 'Nothing for sale right now',
              ),
            ],
          ],
        );
      },
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.shop, required this.ratings});

  final Storefront shop;
  final List<StorefrontRating> ratings;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    Widget stars(num value, double size) => Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        for (var i = 1; i <= 5; i++)
          Glyph(
            Glyphs.star,
            size: size,
            color: i <= value.round() ? colors.star : colors.line,
          ),
      ],
    );
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        Space.gutter,
        Space.x2,
        Space.gutter,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            label: shop.ratingCount == 0
                ? 'No ratings yet'
                : '${shop.averageRating!.toStringAsFixed(1)} out of 5 from '
                      '${shop.ratingCount} ratings',
            excludeSemantics: true,
            child: Row(
              children: [
                if (shop.ratingCount > 0) ...[
                  stars(shop.averageRating ?? 0, 18),
                  const SizedBox(width: Space.x2),
                  Text(
                    '${shop.averageRating!.toStringAsFixed(1)} '
                    '(${shop.ratingCount})',
                    style: type.label,
                  ),
                ] else
                  Text(
                    'No ratings yet',
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
              ],
            ),
          ),
          if (shop.description?.trim().isNotEmpty ?? false) ...[
            const SizedBox(height: Space.x3),
            Text(shop.description!, style: type.body),
          ],
          if (ratings.isNotEmpty) ...[
            const SizedBox(height: Space.x6),
            InsetGroup(
              title: 'What customers say',
              children: [
                for (final r in ratings)
                  Padding(
                    padding: const EdgeInsets.all(Space.x4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            stars(r.rating, 14),
                            const SizedBox(width: Space.x2),
                            Expanded(
                              child: Text(
                                '${r.reviewer}, ${formatDate(r.createdAt)}',
                                style: type.caption.copyWith(
                                  color: colors.inkMuted,
                                ),
                              ),
                            ),
                          ],
                        ),
                        if (r.comment?.trim().isNotEmpty ?? false) ...[
                          const SizedBox(height: Space.x1),
                          Text(r.comment!, style: type.small),
                        ],
                      ],
                    ),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}
