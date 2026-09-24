import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';

import 'pressable.dart';
import 'theme.dart';
import 'tokens.dart';

/// Cupertino's inset grouped list: related rows on one rounded surface, with
/// hairlines that start where the text does. Used for settings-like content
/// only — account, addresses, choices — never to box up a product grid.
class InsetGroup extends StatelessWidget {
  const InsetGroup({
    super.key,
    required this.children,
    this.title,
    this.footer,
  });

  final List<Widget> children;
  final String? title;
  final String? footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      rows.add(children[i]);
      if (i < children.length - 1) {
        rows.add(
          Padding(
            padding: const EdgeInsets.only(left: Space.x4),
            child: Container(height: 0.8, color: colors.line),
          ),
        );
      }
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (title != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x4, 0, Space.x4, Space.x2),
            child: Text(
              title!,
              style: context.type.small.copyWith(
                color: colors.inkMuted,
                fontVariations: const [FontVariation('wght', 600)],
              ),
            ),
          ),
        ClipRRect(
          borderRadius: const BorderRadius.all(Radii.group),
          child: ColoredBox(
            color: colors.surface,
            child: Column(children: rows),
          ),
        ),
        if (footer != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(Space.x4, Space.x2, Space.x4, 0),
            child: Text(
              footer!,
              style: context.type.caption.copyWith(color: colors.inkMuted),
            ),
          ),
      ],
    );
  }
}

class ListRow extends StatelessWidget {
  const ListRow({
    super.key,
    required this.title,
    this.subtitle,
    this.leading,
    this.trailing,
    this.onPressed,
    this.destructive = false,
    this.showChevron,
    this.selected,
  });

  final String title;
  final String? subtitle;
  final IconData? leading;
  final Widget? trailing;
  final VoidCallback? onPressed;
  final bool destructive;

  /// Defaults to shown whenever the row navigates somewhere.
  final bool? showChevron;

  /// For single-choice lists: shows a check on the chosen row.
  final bool? selected;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final titleColor = destructive ? colors.danger : colors.ink;
    final chevron = showChevron ?? (onPressed != null && selected == null);

    Widget row(Set<PressState> states) => AnimatedContainer(
      duration: Motion.fast,
      color: states.contains(PressState.pressed)
          ? colors.tile
          : const Color(0x00000000),
      constraints: const BoxConstraints(minHeight: 54),
      padding: const EdgeInsets.symmetric(
        horizontal: Space.x4,
        vertical: Space.x3,
      ),
      child: Row(
        children: [
          if (leading != null) ...[
            Icon(
              leading,
              size: 22,
              color: destructive ? colors.danger : colors.inkMuted,
            ),
            const SizedBox(width: Space.x3 + 2),
          ],
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(title, style: type.body.copyWith(color: titleColor)),
                if (subtitle != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle!,
                    style: type.small.copyWith(color: colors.inkMuted),
                  ),
                ],
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: Space.x2), trailing!],
          if (selected == true)
            Icon(Icons.check_rounded, color: colors.accent, size: 22),
          if (chevron)
            Icon(
              Icons.chevron_right_rounded,
              color: colors.inkSubtle,
              size: 22,
            ),
        ],
      ),
    );

    if (onPressed == null) return row(const {});
    return Pressable(
      onPressed: onPressed,
      selected: selected,
      pressScale: 1,
      dimOnPress: false,
      focusRadius: Radii.group,
      builder: (context, states) => row(states),
    );
  }
}

/// A shimmering placeholder in the shape of what is coming, so the layout
/// does not jump when data lands. Holds still under reduce-motion.
class Skeleton extends StatefulWidget {
  const Skeleton({
    super.key,
    this.width,
    this.height = 14,
    this.radius = Radii.badge,
  });

  final double? width;
  final double height;
  final Radius radius;

  @override
  State<Skeleton> createState() => _SkeletonState();
}

class _SkeletonState extends State<Skeleton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _pulse.stop();
    } else if (!_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ExcludeSemantics(
      child: FadeTransition(
        opacity: Tween(
          begin: 0.55,
          end: 1.0,
        ).animate(CurvedAnimation(parent: _pulse, curve: Curves.easeInOut)),
        child: Container(
          width: widget.width,
          height: widget.height,
          decoration: BoxDecoration(
            color: colors.tile,
            borderRadius: BorderRadius.all(widget.radius),
          ),
        ),
      ),
    );
  }
}
