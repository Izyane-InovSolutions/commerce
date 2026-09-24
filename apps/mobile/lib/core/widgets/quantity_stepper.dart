import 'package:flutter/material.dart';

class QuantityStepper extends StatelessWidget {
  const QuantityStepper({
    super.key,
    required this.value,
    required this.onChanged,
    this.min = 1,
    this.max = 99,
    this.enabled = true,
  });

  final int value;
  final ValueChanged<int> onChanged;
  final int min;
  final int max;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border.all(color: scheme.outlineVariant),
        borderRadius: BorderRadius.circular(24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: 'Decrease quantity',
            icon: const Icon(Icons.remove),
            onPressed: enabled && value > min ? () => onChanged(value - 1) : null,
          ),
          SizedBox(
            width: 28,
            child: Text('$value',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleSmall),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            tooltip: 'Increase quantity',
            icon: const Icon(Icons.add),
            onPressed: enabled && value < max ? () => onChanged(value + 1) : null,
          ),
        ],
      ),
    );
  }
}
