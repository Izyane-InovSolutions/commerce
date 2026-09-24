import 'package:flutter/widgets.dart';

import 'controls.dart';
import 'overlays.dart';
import 'pressable.dart';
import 'theme.dart';
import 'tokens.dart';

class TabItem {
  const TabItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    this.badge = 0,
  });

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int badge;
}

/// The app's tab bar: frosted glass from Cupertino, with Material 3's pill
/// behind the selected icon — a larger, clearer "you are here" than a colour
/// change alone, which matters in bright sun on a phone.
class BottomTabs extends StatelessWidget {
  const BottomTabs({
    super.key,
    required this.items,
    required this.index,
    required this.onSelect,
  });

  static const height = 64.0;

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
      child: Frosted(
        border: BorderSide(color: colors.line, width: 0.8),
        child: Padding(
          padding: EdgeInsets.only(bottom: bottom),
          child: SizedBox(
            height: height,
            child: Row(
              children: [
                for (var i = 0; i < items.length; i++)
                  Expanded(
                    child: Pressable(
                      onPressed: () => onSelect(i),
                      selected: i == index,
                      haptic: Haptic.selection,
                      dimOnPress: false,
                      pressScale: 0.94,
                      semanticLabel: items[i].badge > 0
                          ? '${items[i].label}, ${items[i].badge} items'
                          : items[i].label,
                      excludeChildSemantics: true,
                      focusRadius: Radii.control,
                      builder: (context, _) =>
                          _TabButton(item: items[i], selected: i == index),
                    ),
                  ),
              ],
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
    final color = selected ? colors.accent : colors.inkMuted;
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        AnimatedContainer(
          duration: context.reduceMotion ? Duration.zero : Motion.base,
          curve: Motion.standard,
          width: selected ? 56 : 40,
          height: 30,
          decoration: BoxDecoration(
            color: selected ? colors.accentWash : const Color(0x00000000),
            borderRadius: const BorderRadius.all(Radius.circular(15)),
          ),
          alignment: Alignment.center,
          child: CountBadge(
            count: item.badge,
            child: Icon(
              selected ? item.activeIcon : item.icon,
              size: 23,
              color: color,
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
                color: color,
                fontVariations: [FontVariation('wght', selected ? 660 : 520)],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
