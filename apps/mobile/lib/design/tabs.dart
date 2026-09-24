import 'package:flutter/widgets.dart';

import 'glyphs.dart';
import 'controls.dart';
import 'pressable.dart';
import 'theme.dart';
import 'tokens.dart';

class TabItem {
  const TabItem({required this.icon, required this.label, this.badge = 0});

  /// Drawn in outline at rest and filled when selected.
  final GlyphData icon;
  final String label;
  final int badge;
}

/// The app's tab bar: a dock that floats clear of the screen edges.
///
/// Neither platform's bar: a raised capsule in the theme's own colours,
/// floating over the content, so the app's frame is recognisably its own on
/// iOS and Android alike, in light mode and dark.
/// What it keeps from each: Cupertino's always-visible labels (an icon
/// alone is a guess), and Material's larger "you are here" — the selected
/// glyph fills in and takes the accent, which still reads in bright sun.
class BottomTabs extends StatelessWidget {
  const BottomTabs({
    super.key,
    required this.items,
    required this.index,
    required this.onSelect,
  });

  static const height = 62.0;
  static const _side = Space.x4;

  /// How far the dock sits above the bottom edge: clear of the home
  /// indicator where there is one, and never flush with the glass.
  static double lift(double safeBottom) =>
      safeBottom > 0 ? (safeBottom - 8).clamp(12.0, 40.0) : 12.0;

  /// The room content must leave at the bottom so its last row is not
  /// hidden behind the dock.
  static double reserved(double safeBottom) =>
      lift(safeBottom) + height + Space.x2;

  final List<TabItem> items;
  final int index;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final bottom = MediaQuery.paddingOf(context).bottom;
    // iOS caps tab-bar labels rather than letting a large text setting
    // double the bar's height and eat the screen; so does this.
    return MediaQuery.withClampedTextScaling(
      maxScaleFactor: 1.25,
      child: Padding(
        padding: EdgeInsets.fromLTRB(_side, 0, _side, lift(bottom)),
        child: Center(
          heightFactor: 1,
          child: ConstrainedBox(
            // On a tablet the dock stays a dock, not a full-width bar.
            constraints: const BoxConstraints(maxWidth: 440),
            child: DecoratedBox(
              decoration: BoxDecoration(
                color: colors.dock,
                borderRadius: const BorderRadius.all(
                  Radius.circular(height / 2),
                ),
                border: Border.all(color: colors.line, width: 0.8),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF000000).withValues(
                      alpha: colors.brightness == Brightness.dark ? 0.4 : 0.1,
                    ),
                    blurRadius: 24,
                    offset: const Offset(0, 8),
                  ),
                ],
              ),
              child: SizedBox(
                height: height,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: Space.x2),
                  child: Row(
                    children: [
                      for (var i = 0; i < items.length; i++)
                        Expanded(
                          child: Pressable(
                            onPressed: () => onSelect(i),
                            selected: i == index,
                            haptic: Haptic.selection,
                            dimOnPress: false,
                            pressScale: 0.9,
                            semanticLabel: items[i].badge > 0
                                ? '${items[i].label}, ${items[i].badge} items'
                                : items[i].label,
                            excludeChildSemantics: true,
                            focusRadius: const Radius.circular(24),
                            builder: (context, _) => _TabButton(
                              item: items[i],
                              selected: i == index,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _TabButton extends StatelessWidget {
  const _TabButton({required this.item, required this.selected});

  final TabItem item;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final color = selected ? colors.dockAccent : colors.onDockMuted;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        CountBadge(
          count: item.badge,
          ring: colors.dock,
          child: TweenAnimationBuilder<double>(
            tween: Tween(end: selected ? 1 : 0),
            duration: context.reduceMotion ? Duration.zero : Motion.base,
            curve: Motion.standard,
            // The selected glyph rises a touch as it fills — the one bit of
            // motion on the dock, answering the tap.
            builder: (context, t, child) =>
                Transform.translate(offset: Offset(0, -1.5 * t), child: child),
            child: Glyph(
              item.icon,
              size: 24,
              color: color,
              fillColor: colors.dockAccent.withValues(alpha: 0.28),
              active: selected,
            ),
          ),
        ),
        const SizedBox(height: 3),
        // One line always; a long label on a narrow phone shrinks to fit.
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: Space.x1),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Text(
              item.label,
              maxLines: 1,
              softWrap: false,
              style: context.type.caption.copyWith(
                fontSize: 11.5,
                color: color,
                fontVariations: [FontVariation('wght', selected ? 680 : 540)],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
