import 'package:flutter/widgets.dart';

import '../../data/catalog_repository.dart';
import '../../design/design.dart';

/// Opens the sort choices as a sheet.
class SortButton extends StatelessWidget {
  const SortButton({super.key, required this.value, required this.onChanged});

  final ProductSort value;
  final ValueChanged<ProductSort> onChanged;

  @override
  Widget build(BuildContext context) => IconAction(
    icon: Glyphs.sort,
    semanticLabel: 'Sort, currently ${value.label}',
    onPressed: () async {
      final chosen = await chooseOption<ProductSort>(
        context,
        title: 'Sort by',
        selected: value,
        options: [
          for (final sort in ProductSort.values) SheetOption(sort, sort.label),
        ],
      );
      if (chosen != null && chosen != value) onChanged(chosen);
    },
  );
}
