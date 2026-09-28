import 'package:flutter/widgets.dart';

import '../../data/catalog_repository.dart';
import '../../design/design.dart';
import 'product_filters.dart';
import 'product_list_controller.dart';

/// Opens the sort choices as a sheet: the orders the API sorts by, and the
/// ones sorted on the phone (price, rating), in one list.
class SortButton extends StatelessWidget {
  const SortButton({super.key, required this.products});

  final ProductListController products;

  @override
  Widget build(BuildContext context) {
    final local = products.filters.sort;
    final label = local?.label ?? products.query.sort.label;
    return IconAction(
      icon: Glyphs.sort,
      semanticLabel: 'Sort, currently $label',
      onPressed: () async {
        final chosen = await chooseOption<Object>(
          context,
          title: 'Sort by',
          selected: local ?? products.query.sort,
          options: [
            for (final sort in ProductSort.values)
              SheetOption<Object>(sort, sort.label),
            for (final sort in LocalSort.values)
              SheetOption<Object>(sort, sort.label),
          ],
        );
        switch (chosen) {
          case final ProductSort sort:
            await products.setFilters(
              products.filters.copyWith(sort: () => null),
            );
            if (sort != products.query.sort) {
              await products.load(products.query.copyWith(sort: sort));
            }
          case final LocalSort sort:
            await products.setFilters(
              products.filters.copyWith(sort: () => sort),
            );
        }
      },
    );
  }
}
