import 'dart:async';

import 'package:flutter/material.dart' show Icons;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../data/catalog_repository.dart';
import '../../design/design.dart';
import '../../domain/catalog.dart';
import 'product_grid.dart';
import 'product_list_controller.dart';
import 'sort_button.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

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
    _products = ProductListController(catalog)..load();
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

  void _onTyped(String value) {
    _debounce?.cancel();
    _debounce = Timer(
      const Duration(milliseconds: 350),
      () => _update(_products.query.copyWith(search: value.trim())),
    );
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
          builder: (context, _) => SortButton(
            value: _products.query.sort,
            onChanged: (sort) => _update(_products.query.copyWith(sort: sort)),
          ),
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
              leading: Icons.search_rounded,
              textInputAction: TextInputAction.search,
              onChanged: _onTyped,
              onSubmitted: (value) {
                _debounce?.cancel();
                _update(_products.query.copyWith(search: value.trim()));
              },
              trailing: ListenableBuilder(
                listenable: _text,
                builder: (context, _) => _text.text.isEmpty
                    ? const SizedBox.shrink()
                    : IconAction(
                        icon: Icons.cancel_rounded,
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
            listenable: Listenable.merge([_products, _categories, _brands]),
            builder: (context, _) => _Filters(
              query: _products.query,
              categories: _categories.data ?? const [],
              brands: _brands.data ?? const [],
              resultCount: _products.hasLoaded && _products.errorMessage == null
                  ? _products.total
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
    required this.query,
    required this.categories,
    required this.brands,
    required this.resultCount,
    required this.onChanged,
    required this.onChooseBrand,
  });

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
        if (categories.isNotEmpty || brands.isNotEmpty)
          SizedBox(
            height: 40,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              scrollDirection: Axis.horizontal,
              children: [
                // Offered only when the catalog actually has brands.
                if (brands.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(right: Space.x2),
                    child: SelectChip(
                      label: brandName ?? 'Brand',
                      icon: Icons.tune_rounded,
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
                          categorySlug: () =>
                              query.categorySlug == category.slug
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
                : resultCount == 1
                ? '1 product'
                : '$resultCount products',
            style: context.type.small.copyWith(color: context.colors.inkMuted),
          ),
        ),
      ],
    );
  }
}
