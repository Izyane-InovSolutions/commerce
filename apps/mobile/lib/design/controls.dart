import 'package:flutter/widgets.dart';

import 'glyphs.dart';
import 'pressable.dart';
import 'theme.dart';
import 'tokens.dart';

/// A filter or choice: a borderless tag. The selected one turns solid ink,
/// the strongest mark on a light page, so "what is applied" reads from
/// across a scrolling row without a tick or an outline.
class SelectChip extends StatelessWidget {
  const SelectChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onPressed,
    this.icon,
  });

  final String label;
  final bool selected;
  final VoidCallback? onPressed;
  final GlyphData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final foreground = selected ? colors.paper : colors.ink;
    return Pressable(
      onPressed: onPressed,
      selected: selected,
      haptic: Haptic.selection,
      focusRadius: Radii.chip,
      builder: (context, _) => AnimatedContainer(
        duration: Motion.fast,
        constraints: const BoxConstraints(minHeight: 38),
        padding: const EdgeInsets.symmetric(horizontal: Space.x4),
        decoration: BoxDecoration(
          color: selected ? colors.ink : colors.tile,
          borderRadius: const BorderRadius.all(Radii.chip),
        ),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (icon != null) ...[
              Glyph(icon!, size: 16, color: foreground),
              const SizedBox(width: Space.x1 + 2),
            ],
            Text(
              label,
              style: context.type.small.copyWith(
                color: foreground,
                fontVariations: const [FontVariation('wght', 580)],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

enum Tone { neutral, accent, warning, danger }

/// A short status — "Awaiting payment", "Paid", "Out of stock". Sentence
/// case, never all caps: status is read, not shouted.
class StatusBadge extends StatelessWidget {
  const StatusBadge(this.label, {super.key, this.tone = Tone.neutral});

  final String label;
  final Tone tone;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final (background, foreground) = switch (tone) {
      Tone.neutral => (colors.tile, colors.inkMuted),
      Tone.accent => (colors.accentWash, colors.accent),
      Tone.warning => (colors.warningWash, colors.warning),
      Tone.danger => (colors.dangerWash, colors.danger),
    };
    return DecoratedBox(
      decoration: BoxDecoration(
        color: background,
        borderRadius: const BorderRadius.all(Radii.badge),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: Space.x2, vertical: 3),
        child: Text(
          label,
          style: context.type.caption.copyWith(
            color: foreground,
            fontVariations: const [FontVariation('wght', 640)],
          ),
        ),
      ),
    );
  }
}

/// A count on an icon — the cart tab.
class CountBadge extends StatelessWidget {
  const CountBadge({
    super.key,
    required this.count,
    required this.child,
    this.ring,
  });

  final int count;
  final Widget child;

  /// The colour of the gap around the badge: whatever it sits on.
  final Color? ring;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        child,
        if (count > 0)
          Positioned(
            right: -8,
            top: -4,
            child: Container(
              constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
              padding: const EdgeInsets.symmetric(horizontal: 5),
              decoration: BoxDecoration(
                color: colors.accent,
                borderRadius: const BorderRadius.all(Radius.circular(9)),
                border: Border.all(color: ring ?? colors.paper, width: 2),
              ),
              alignment: Alignment.center,
              child: Text(
                count > 99 ? '99+' : '$count',
                style: context.type
                    .figures(11, 700)
                    .copyWith(color: colors.onAccent, height: 1.2),
              ),
            ),
          ),
      ],
    );
  }
}

/// Cupertino's sliding segmented control: a raised thumb glides to the
/// chosen segment. Selection changes click the selection haptic.
class SegmentedChoice<T> extends StatelessWidget {
  const SegmentedChoice({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final Map<T, String> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final keys = options.keys.toList();
    final index = keys.indexOf(value);

    return Container(
      height: 46,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: colors.tile,
        borderRadius: const BorderRadius.all(Radii.control),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth / keys.length;
          return Stack(
            children: [
              AnimatedPositioned(
                duration: context.reduceMotion ? Duration.zero : Motion.base,
                curve: Motion.standard,
                left: width * index,
                top: 0,
                bottom: 0,
                width: width,
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    color: colors.surface,
                    borderRadius: const BorderRadius.all(Radius.circular(11)),
                    boxShadow: [
                      BoxShadow(
                        color: colors.ink.withValues(alpha: 0.10),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),
                ),
              ),
              Row(
                children: [
                  for (final key in keys)
                    Expanded(
                      child: Pressable(
                        onPressed: key == value ? () {} : () => onChanged(key),
                        selected: key == value,
                        haptic: Haptic.selection,
                        dimOnPress: false,
                        pressScale: 0.98,
                        focusRadius: const Radius.circular(11),
                        builder: (context, _) => Center(
                          child: Text(
                            options[key]!,
                            style: context.type.small.copyWith(
                              color: key == value
                                  ? colors.ink
                                  : colors.inkMuted,
                              fontVariations: [
                                FontVariation('wght', key == value ? 640 : 520),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

class ChoiceTile<T> {
  const ChoiceTile(this.value, this.label, {required this.glyph, this.detail});

  final T value;
  final String label;
  final GlyphData glyph;

  /// One short line under the label: "MTN · Airtel", "Visa · Mastercard".
  final String? detail;
}

/// A choice between a few *kinds* of thing — how to pay — as side-by-side
/// tiles. Bigger and more explanatory than a segmented control, which is
/// kept for switching between variants of one thing (which network).
class ChoiceTiles<T> extends StatelessWidget {
  const ChoiceTiles({
    super.key,
    required this.options,
    required this.value,
    required this.onChanged,
  });

  final List<ChoiceTile<T>> options;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, option) in options.indexed) ...[
            if (i > 0) const SizedBox(width: Space.x3),
            Expanded(
              child: Pressable(
                onPressed: () => onChanged(option.value),
                selected: option.value == value,
                haptic: Haptic.selection,
                pressScale: 0.98,
                focusRadius: Radii.tile,
                builder: (context, _) {
                  final selected = option.value == value;
                  return AnimatedContainer(
                    duration: Motion.fast,
                    curve: Motion.standard,
                    padding: const EdgeInsets.all(Space.x4 - 1),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: const BorderRadius.all(Radii.tile),
                      border: Border.all(
                        color: selected ? colors.accent : colors.surface,
                        width: 2,
                      ),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Glyph(
                              option.glyph,
                              size: 22,
                              color: selected ? colors.accent : colors.inkMuted,
                            ),
                            const Spacer(),
                            // Shape as well as colour marks the choice.
                            AnimatedContainer(
                              duration: Motion.fast,
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: selected
                                    ? colors.accent
                                    : const Color(0x00000000),
                                border: Border.all(
                                  color: selected ? colors.accent : colors.line,
                                  width: 2,
                                ),
                              ),
                              child: selected
                                  ? Glyph(
                                      Glyphs.check,
                                      size: 14,
                                      color: colors.onAccent,
                                    )
                                  : null,
                            ),
                          ],
                        ),
                        const SizedBox(height: Space.x3),
                        Text(option.label, style: type.label),
                        if (option.detail != null) ...[
                          const SizedBox(height: 2),
                          Text(
                            option.detail!,
                            style: type.caption.copyWith(
                              color: colors.inkMuted,
                            ),
                          ),
                        ],
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

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
    final colors = context.colors;
    Widget step(GlyphData icon, String label, int? next) => Pressable(
      onPressed: enabled && next != null ? () => onChanged(next) : null,
      semanticLabel: label,
      excludeChildSemantics: true,
      haptic: Haptic.selection,
      pressScale: 0.88,
      focusRadius: const Radius.circular(20),
      builder: (context, states) => SizedBox.square(
        dimension: 44,
        child: Glyph(
          icon,
          size: 18,
          color: states.contains(PressState.disabled)
              ? colors.inkSubtle
              : colors.ink,
        ),
      ),
    );

    return Container(
      decoration: BoxDecoration(
        color: colors.tile,
        borderRadius: const BorderRadius.all(Radii.control),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          step(
            Glyphs.remove,
            'Decrease quantity',
            value > min ? value - 1 : null,
          ),
          Semantics(
            label: 'Quantity $value',
            excludeSemantics: true,
            child: SizedBox(
              width: 30,
              child: Text(
                '$value',
                textAlign: TextAlign.center,
                style: context.type
                    .figures(17, 680)
                    .copyWith(color: colors.ink),
              ),
            ),
          ),
          step(Glyphs.add, 'Increase quantity', value < max ? value + 1 : null),
        ],
      ),
    );
  }
}
