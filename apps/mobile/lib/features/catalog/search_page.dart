import 'dart:async';

import 'package:flutter/material.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../data/catalog_repository.dart';
import '../../domain/catalog.dart';
import 'product_grid.dart';
import 'product_list_controller.dart';
import 'sort_button.dart';

class SearchPage extends StatefulWidget {
  const SearchPage({super.key});

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
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _products.load(_products.query.copyWith(search: value.trim()));
    });
  }

  void _update(ProductQuery query) => _products.load(query);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        title: TextField(
          controller: _text,
          onChanged: _onTyped,
          textInputAction: TextInputAction.search,
          onSubmitted: (value) {
            _debounce?.cancel();
            _update(_products.query.copyWith(search: value.trim()));
          },
          decoration: InputDecoration(
            hintText: 'Search products',
            prefixIcon: const Icon(Icons.search),
            isDense: true,
            suffixIcon: ListenableBuilder(
              listenable: _text,
              builder: (context, _) => _text.text.isEmpty
                  ? const SizedBox.shrink()
                  : IconButton(
                      tooltip: 'Clear',
                      icon: const Icon(Icons.close),
                      onPressed: () {
                        _text.clear();
                        _update(_products.query.copyWith(search: ''));
                      },
                    ),
            ),
          ),
        ),
        actions: [
          ListenableBuilder(
            listenable: _products,
            builder: (context, _) => SortButton(
              value: _products.query.sort,
              onChanged: (sort) => _update(_products.query.copyWith(sort: sort)),
            ),
          ),
        ],
      ),
      body: ProductGrid(
        controller: _products,
        emptyTitle: 'No matching products',
        emptyMessage: 'Try another search or clear the filters.',
        header: [
          SliverToBoxAdapter(
            child: ListenableBuilder(
              listenable: Listenable.merge([_products, _categories, _brands]),
              builder: (context, _) => _Filters(
                query: _products.query,
                categories: _categories.data ?? const [],
                brands: _brands.data ?? const [],
                resultCount: _products.hasLoaded ? _products.total : null,
                onChanged: _update,
              ),
            ),
          ),
        ],
      ),
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
  });

  final ProductQuery query;
  final List<Category> categories;
  final List<Brand> brands;
  final int? resultCount;
  final ValueChanged<ProductQuery> onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (categories.isNotEmpty)
          SizedBox(
            height: 52,
            child: ListView(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              scrollDirection: Axis.horizontal,
              children: [
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    label: const Text('All'),
                    selected: query.categorySlug == null,
                    onSelected: (_) =>
                        onChanged(query.copyWith(categorySlug: () => null)),
                  ),
                ),
                for (final category in categories)
                  Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(category.name),
                      selected: query.categorySlug == category.slug,
                      onSelected: (selected) => onChanged(query.copyWith(
                          categorySlug: () => selected ? category.slug : null)),
                    ),
                  ),
              ],
            ),
          ),
        // Only offered when the catalog actually has brands to filter by.
        if (brands.isNotEmpty)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: DropdownButtonFormField<String?>(
              initialValue: query.brandSlug,
              decoration: const InputDecoration(labelText: 'Brand', isDense: true),
              items: [
                const DropdownMenuItem(value: null, child: Text('Any brand')),
                for (final brand in brands)
                  DropdownMenuItem(value: brand.slug, child: Text(brand.name)),
              ],
              onChanged: (slug) => onChanged(query.copyWith(brandSlug: () => slug)),
            ),
          ),
        if (resultCount != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: Text(
              resultCount == 1 ? '1 product' : '$resultCount products',
              style: Theme.of(context).textTheme.labelLarge,
            ),
          ),
      ],
    );
  }
}
