import 'package:flutter/material.dart';

import '../../data/catalog_repository.dart';

class SortButton extends StatelessWidget {
  const SortButton({super.key, required this.value, required this.onChanged});

  final ProductSort value;
  final ValueChanged<ProductSort> onChanged;

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<ProductSort>(
      tooltip: 'Sort',
      icon: const Icon(Icons.sort),
      initialValue: value,
      onSelected: onChanged,
      itemBuilder: (context) => [
        for (final sort in ProductSort.values)
          CheckedPopupMenuItem(
            value: sort,
            checked: sort == value,
            child: Text(sort.label),
          ),
      ],
    );
  }
}
