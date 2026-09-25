import 'package:flutter/widgets.dart';

import '../../design/design.dart';
import 'product_filters.dart';
import 'product_list_controller.dart';

/// Opens the filters for a product list; applies them when confirmed.
Future<void> showFilters(
  BuildContext context,
  ProductListController products,
) async {
  final chosen = await showSheet<ProductFilters>(
    context,
    label: 'Filters',
    builder: (context) => _FilterSheet(initial: products.filters),
  );
  if (chosen != null) await products.setFilters(chosen);
}

class _FilterSheet extends StatefulWidget {
  const _FilterSheet({required this.initial});

  final ProductFilters initial;

  @override
  State<_FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<_FilterSheet> {
  late ProductFilters _f = widget.initial;

  void _set(ProductFilters f) => setState(() => _f = f);

  @override
  Widget build(BuildContext context) {
    final type = context.type;
    Widget heading(String text) => Padding(
      padding: const EdgeInsets.only(top: Space.x5, bottom: Space.x2),
      child: GroupTitle(text),
    );
    Widget chips(List<Widget> children) =>
        Wrap(spacing: Space.x2, runSpacing: Space.x2, children: children);

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        Space.gutter,
        0,
        Space.gutter,
        Space.x2,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              Expanded(child: Text('Filters', style: type.heading)),
              if (_f.activeCount > 0)
                LinkAction(
                  label: 'Clear all',
                  onPressed: () => _set(
                    ProductFilters(sort: _f.sort, sellerId: _f.sellerId),
                  ),
                ),
            ],
          ),
          heading('Price'),
          chips([
            for (final band in PriceBand.values)
              SelectChip(
                label: band.label,
                selected: _f.price == band,
                onPressed: () => _set(_f.copyWith(price: band)),
              ),
          ]),
          heading('Customer rating'),
          chips([
            for (final stars in [null, 4, 3])
              SelectChip(
                label: stars == null ? 'Any' : '$stars stars and up',
                icon: stars == null ? null : Glyphs.star,
                selected: _f.minRating == stars,
                onPressed: () => _set(_f.copyWith(minRating: () => stars)),
              ),
          ]),
          const SizedBox(height: Space.x5),
          InsetGroup(
            children: [
              SwitchRow(
                title: 'In stock only',
                value: _f.inStockOnly,
                onChanged: (v) => _set(_f.copyWith(inStockOnly: v)),
              ),
              SwitchRow(
                title: 'Free delivery',
                value: _f.freeDelivery,
                onChanged: (v) => _set(_f.copyWith(freeDelivery: v)),
              ),
              SwitchRow(
                title: 'Can be returned',
                value: _f.returnable,
                onChanged: (v) => _set(_f.copyWith(returnable: v)),
              ),
            ],
          ),
          const SizedBox(height: Space.x6),
          Button(
            label: 'Show results',
            onPressed: () => Navigator.of(context).pop(_f),
          ),
        ],
      ),
    );
  }
}

/// The filters button for a list's bar of chips, with a count of what is on.
class FiltersChip extends StatelessWidget {
  const FiltersChip({super.key, required this.products});

  final ProductListController products;

  @override
  Widget build(BuildContext context) {
    final count = products.filters.activeCount;
    return SelectChip(
      label: count == 0 ? 'Filters' : 'Filters ($count)',
      icon: Glyphs.filters,
      selected: count > 0,
      onPressed: () => showFilters(context, products),
    );
  }
}
