import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../data/catalog_repository.dart';
import '../../design/design.dart';
import 'product_grid.dart';
import 'product_list_controller.dart';
import 'sort_button.dart';

class CategoryPage extends StatefulWidget {
  const CategoryPage({super.key, required this.slug, this.title});

  final String slug;

  /// Passed from the category chip, so the title shows at once.
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
    _products = ProductListController(
      context.services.catalog,
      query: ProductQuery(categorySlug: widget.slug),
    )..load();
  }

  @override
  void dispose() {
    _products.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: widget.title ?? 'Category',
      onRefresh: _products.load,
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
      slivers: [
        const SliverToBoxAdapter(child: SizedBox(height: Space.x3)),
        ProductGridSliver(
          controller: _products,
          emptyTitle: 'Nothing in this category yet',
          emptyMessage: 'New listings appear here as sellers add them.',
        ),
      ],
    );
  }
}
