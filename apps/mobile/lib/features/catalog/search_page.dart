import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../data/catalog_repository.dart';
import '../../design/design.dart';
import '../../domain/catalog.dart';
import 'filter_sheet.dart';
import 'product_grid.dart';
import 'product_list_controller.dart';
import 'sort_button.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key, this.query});

  /// Search for this on arrival — from "See all" on the Shop tab.
  final String? query;

  static const fieldKey = ValueKey('search-field');

  @override
  State<SearchPage> createState() => _SearchPageState();
}

class _SearchPageState extends State<SearchPage> {
  final _text = TextEditingController();
  late final ProductListController _products;
  late final Loader<List<Category>> _categories;
  late final Loader<List<Brand>> _brands;
  Timer? _debounce;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final catalog = context.services.catalog;
    final initial = widget.query?.trim() ?? '';
    _text.text = initial;
    _products = ProductListController(
      catalog,
      query: ProductQuery(search: initial),
    )..load();
    _categories = Loader(catalog.categories);
    _brands = Loader(catalog.brands);
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _text.dispose();
    _products.dispose();
    _categories.dispose();
    _brands.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(SearchPage oldWidget) {
    super.didUpdateWidget(oldWidget);
    final query = widget.query?.trim();
    if (query != null && query != oldWidget.query?.trim()) _search(query);
  }

  void _onTyped(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(value));
  }

  /// Runs a search, and remembers it for "based on your search" — typing
  /// pauses count as well as submitting, as few people press search.
  void _search(String value) {
    final query = value.trim();
    if (_text.text != value) _text.text = query;
    _update(_products.query.copyWith(search: query));
    context.services.history.searched(query);
  }

  void _update(ProductQuery query) => _products.load(query);

  Future<void> _chooseBrand(List<Brand> brands) async {
    final chosen = await chooseOption<String>(
      context,
      title: 'Brand',
      selected: _products.query.brandSlug ?? '',
      options: [
        const SheetOption('', 'Any brand'),
        for (final brand in brands) SheetOption(brand.slug, brand.name),
      ],
    );
    if (chosen == null) return;
    _update(
      _products.query.copyWith(brandSlug: () => chosen.isEmpty ? null : chosen),
    );
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Search',
      showBack: false,
      onRefresh: _products.load,
      actions: [
        ListenableBuilder(
          listenable: _products,
          builder: (context, _) => SortButton(products: _products),
        ),
      ],
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              Space.x3,
            ),
            child: InputField(
              key: SearchPage.fieldKey,
              controller: _text,
              dense: true,
              hint: 'Search products',
              leading: Glyphs.search,
              textInputAction: TextInputAction.search,
              onChanged: _onTyped,
              onSubmitted: (value) {
                _debounce?.cancel();
                _search(value);
              },
              trailing: ListenableBuilder(
                listenable: _text,
                builder: (context, _) => _text.text.isEmpty
                    ? const SizedBox.shrink()
                    : IconAction(
                        icon: Glyphs.closeCircle,
                        semanticLabel: 'Clear search',
                        size: 20,
                        color: context.colors.inkSubtle,
                        onPressed: () {
                          _text.clear();
                          _update(_products.query.copyWith(search: ''));
                        },
                      ),
              ),
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: ListenableBuilder(
            listenable: Listenable.merge([_text, context.services.history]),
            builder: (context, _) {
              final recent = context.services.history.searches;
              if (_text.text.isNotEmpty || recent.isEmpty) {
                return const SizedBox.shrink();
              }
              return _RecentSearches(
                searches: recent,
                onPick: _search,
                onForget: context.services.history.forgetSearch,
              );
            },
          ),
        ),
        SliverToBoxAdapter(
          child: ListenableBuilder(
            listenable: Listenable.merge([_products, _categories, _brands]),
            builder: (context, _) => _Filters(
              products: _products,
              query: _products.query,
              categories: _categories.data ?? const [],
              brands: _brands.data ?? const [],
              resultCount: _products.hasLoaded && _products.errorMessage == null
                  ? (_products.filters.isActive
                        ? _products.products.length
                        : _products.total)
                  : null,
              onChanged: _update,
              onChooseBrand: _chooseBrand,
            ),
          ),
        ),
        ProductGridSliver(
          controller: _products,
          emptyTitle: 'No matching products',
          emptyMessage: 'Try fewer words, or clear the filters.',
        ),
      ],
    );
  }
}

class _Filters extends StatelessWidget {
  const _Filters({
    required this.products,
    required this.query,
    required this.categories,
    required this.brands,
    required this.resultCount,
    required this.onChanged,
    required this.onChooseBrand,
  });

  final ProductListController products;
  final ProductQuery query;
  final List<Category> categories;
  final List<Brand> brands;
  final int? resultCount;
  final ValueChanged<ProductQuery> onChanged;
  final ValueChanged<List<Brand>> onChooseBrand;

  @override
  Widget build(BuildContext context) {
    final brandName = brands
        .where((brand) => brand.slug == query.brandSlug)
        .map((brand) => brand.name)
        .firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          height: 40,
          child: ListView(
            padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
            scrollDirection: Axis.horizontal,
            children: [
              Padding(
                padding: const EdgeInsets.only(right: Space.x2),
                child: FiltersChip(products: products),
              ),
              // The two filters people reach for most, one tap away.
              Padding(
                padding: const EdgeInsets.only(right: Space.x2),
                child: SelectChip(
                  label: 'In stock',
                  selected: products.filters.inStockOnly,
                  onPressed: () => products.setFilters(
                    products.filters.copyWith(
                      inStockOnly: !products.filters.inStockOnly,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(right: Space.x2),
                child: SelectChip(
                  label: 'Free delivery',
                  selected: products.filters.freeDelivery,
                  onPressed: () => products.setFilters(
                    products.filters.copyWith(
                      freeDelivery: !products.filters.freeDelivery,
                    ),
                  ),
                ),
              ),
              // Offered only when the catalog actually has brands.
              if (brands.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(right: Space.x2),
                  child: SelectChip(
                    label: brandName ?? 'Brand',
                    icon: Glyphs.filters,
                    selected: brandName != null,
                    onPressed: () => onChooseBrand(brands),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.only(right: Space.x2),
                child: SelectChip(
                  label: 'All',
                  selected: query.categorySlug == null,
                  onPressed: () =>
                      onChanged(query.copyWith(categorySlug: () => null)),
                ),
              ),
              for (final category in categories)
                Padding(
                  padding: const EdgeInsets.only(right: Space.x2),
                  child: SelectChip(
                    label: category.name,
                    selected: query.categorySlug == category.slug,
                    onPressed: () => onChanged(
                      query.copyWith(
                        categorySlug: () => query.categorySlug == category.slug
                            ? null
                            : category.slug,
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            Space.gutter,
            Space.x4,
            Space.gutter,
            Space.x3,
          ),
          child: Text(
            resultCount == null
                ? ' '
                : [
                    resultCount == 1 ? '1 product' : '$resultCount products',
                    if (products.filteredPartially)
                      'among the first ${products.loadedCount}',
                  ].join(' '),
            style: context.type.small.copyWith(color: context.colors.inkMuted),
          ),
        ),
      ],
    );
  }
}

class _RecentSearches extends StatelessWidget {
  const _RecentSearches({
    required this.searches,
    required this.onPick,
    required this.onForget,
  });

  final List<String> searches;
  final ValueChanged<String> onPick;
  final ValueChanged<String> onForget;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x3),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.symmetric(horizontal: Space.x1),
            child: GroupTitle('Recent searches'),
          ),
          SizedBox(
            height: 40,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              scrollDirection: Axis.horizontal,
              itemCount: searches.length,
              separatorBuilder: (_, _) => const SizedBox(width: Space.x2),
              itemBuilder: (context, i) => Pressable(
                onPressed: () => onPick(searches[i]),
                focusRadius: Radii.chip,
                semanticLabel: 'Search for ${searches[i]}',
                excludeChildSemantics: true,
                builder: (context, _) => Container(
                  padding: const EdgeInsets.only(left: Space.x3),
                  decoration: BoxDecoration(
                    color: context.colors.tile,
                    borderRadius: const BorderRadius.all(Radii.chip),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Glyph(
                        Glyphs.clock,
                        size: 15,
                        color: context.colors.inkMuted,
                      ),
                      const SizedBox(width: Space.x2),
                      Text(searches[i], style: context.type.small),
                      IconAction(
                        icon: Glyphs.close,
                        size: 14,
                        semanticLabel: 'Forget ${searches[i]}',
                        onPressed: () => onForget(searches[i]),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
