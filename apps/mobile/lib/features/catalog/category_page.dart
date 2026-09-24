import 'package:flutter/material.dart';

import '../../app/services.dart';
import '../../data/catalog_repository.dart';
import 'product_grid.dart';
import 'product_list_controller.dart';
import 'sort_button.dart';

class CategoryPage extends StatefulWidget {
  const CategoryPage({super.key, required this.slug, this.title});

  final String slug;

  /// Passed along when navigating from a category chip, so the title shows
  /// immediately instead of after a lookup.
  final String? title;

  @override
  State<CategoryPage> createState() => _CategoryPageState();
}

class _CategoryPageState extends State<CategoryPage> {
  late final ProductListController _products;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    _products = ProductListController(context.services.catalog,
        query: ProductQuery(categorySlug: widget.slug))
      ..load();
  }

  @override
  void dispose() {
    _products.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title ?? 'Category'),
        actions: [
          ListenableBuilder(
            listenable: _products,
            builder: (context, _) => SortButton(
              value: _products.query.sort,
              onChanged: (sort) =>
                  _products.load(_products.query.copyWith(sort: sort)),
            ),
          ),
        ],
      ),
      body: ProductGrid(
        controller: _products,
        emptyTitle: 'Nothing in this category yet',
      ),
    );
  }
}
