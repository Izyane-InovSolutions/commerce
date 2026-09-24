import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../domain/catalog.dart';
import '../catalog/product_grid.dart';
import '../catalog/product_list_controller.dart';

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  late final ProductListController _products;
  late final Loader<List<Category>> _categories;
  bool _initialised = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialised) return;
    _initialised = true;
    final catalog = context.services.catalog;
    _products = ProductListController(catalog)..load();
    _categories = Loader(catalog.categories);
  }

  @override
  void dispose() {
    _products.dispose();
    _categories.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    await Future.wait([_products.load(), _categories.load(silent: true)]);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Commerce'),
        actions: [
          IconButton(
            tooltip: 'Search',
            icon: const Icon(Icons.search),
            onPressed: () => context.go('/search'),
          ),
        ],
      ),
      body: ProductGrid(
        controller: _products,
        onRefresh: _refresh,
        header: [
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(28),
                onTap: () => context.go('/search'),
                child: IgnorePointer(
                  child: SearchBar(
                    hintText: 'Search products',
                    leading: const Icon(Icons.search),
                    elevation: const WidgetStatePropertyAll(0),
                  ),
                ),
              ),
            ),
          ),
          SliverToBoxAdapter(
            child: ListenableBuilder(
              listenable: _categories,
              builder: (context, _) {
                final categories = _categories.data ?? const [];
                if (categories.isEmpty) return const SizedBox.shrink();
                return SizedBox(
                  height: 48,
                  child: ListView.separated(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    scrollDirection: Axis.horizontal,
                    itemCount: categories.length,
                    separatorBuilder: (_, _) => const SizedBox(width: 8),
                    itemBuilder: (context, index) {
                      final category = categories[index];
                      return ActionChip(
                        avatar: const Icon(Icons.category_outlined, size: 18),
                        label: Text(category.name),
                        onPressed: () => context.push(
                          '/category/${category.slug}',
                          extra: category.name,
                        ),
                      );
                    },
                  ),
                );
              },
            ),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
              child: Text('New arrivals', style: theme.textTheme.titleLarge),
            ),
          ),
        ],
      ),
    );
  }
}
