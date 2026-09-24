import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/state/loader.dart';
import '../../design/design.dart';
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

  Future<void> _refresh() =>
      Future.wait([_products.load(), _categories.load(silent: true)]);

  @override
  Widget build(BuildContext context) {
    return PageScaffold(
      title: 'Commerce',
      showBack: false,
      onRefresh: _refresh,
      slivers: [
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              Space.gutter,
              Space.x3,
              Space.gutter,
              Space.x4,
            ),
            child: _SearchEntry(onPressed: () => context.go('/search')),
          ),
        ),
        SliverToBoxAdapter(
          child: ListenableBuilder(
            listenable: _categories,
            builder: (context, _) {
              final categories = _categories.data ?? const [];
              if (categories.isEmpty) return const SizedBox.shrink();
              return SizedBox(
                height: 40,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                  scrollDirection: Axis.horizontal,
                  itemCount: categories.length,
                  separatorBuilder: (_, _) => const SizedBox(width: Space.x2),
                  itemBuilder: (context, index) {
                    final category = categories[index];
                    return SelectChip(
                      label: category.name,
                      selected: false,
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
        const SliverToBoxAdapter(child: SectionTitle('New arrivals')),
        ProductGridSliver(controller: _products),
      ],
    );
  }
}

/// Looks like the search field; is a doorway to the Search tab, where the
/// real one lives with its filters.
class _SearchEntry extends StatelessWidget {
  const _SearchEntry({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Pressable(
      onPressed: onPressed,
      semanticLabel: 'Search products',
      excludeChildSemantics: true,
      pressScale: 0.99,
      builder: (context, _) => Container(
        height: 50,
        padding: const EdgeInsets.symmetric(horizontal: Space.x4),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: const BorderRadius.all(Radii.control),
          border: Border.all(color: colors.line),
        ),
        child: Row(
          children: [
            Icon(Icons.search_rounded, size: 20, color: colors.inkMuted),
            const SizedBox(width: Space.x3),
            Expanded(
              child: Text(
                'Search products',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: context.type.body.copyWith(color: colors.inkSubtle),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
