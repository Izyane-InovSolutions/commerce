import 'package:flutter/widgets.dart';

import 'glyphs.dart';
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
        if (title != null) GroupTitle(title!),
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

/// The small heading above a grouped list, for use on its own where the
/// content under it is not a single group.
class GroupTitle extends StatelessWidget {
  const GroupTitle(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(Space.x4, 0, Space.x4, Space.x2),
    child: Semantics(
      header: true,
      child: Text(
        text,
        style: context.type.small.copyWith(
          color: context.colors.inkMuted,
          fontVariations: const [FontVariation('wght', 600)],
        ),
      ),
    ),
  );
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
  final GlyphData? leading;
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
            Glyph(
              leading!,
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
            Glyph(Glyphs.check, color: colors.accent, size: 22),
          if (chevron) Glyph(Glyphs.forward, color: colors.inkSubtle, size: 22),
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

/// A row that turns something on or off, with a switch at its end. The
/// whole row is the target, not just the switch.
class SwitchRow extends StatelessWidget {
  const SwitchRow({
    super.key,
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    return Semantics(
      toggled: value,
      child: Pressable(
        onPressed: onChanged == null ? null : () => onChanged!(!value),
        haptic: Haptic.selection,
        pressScale: 1,
        dimOnPress: false,
        focusRadius: Radii.group,
        builder: (context, states) => AnimatedContainer(
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
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(title, style: type.body),
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
              const SizedBox(width: Space.x3),
              _Switch(value: value),
            ],
          ),
        ),
      ),
    );
  }
}

/// The switch itself: a squared-off track, in the design system's radii
/// rather than either platform's pill, with the thumb carrying a check when
/// on — state shown by shape as well as colour.
class _Switch extends StatelessWidget {
  const _Switch({required this.value});

  final bool value;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final duration = context.reduceMotion ? Duration.zero : Motion.base;
    return AnimatedContainer(
      duration: duration,
      curve: Motion.standard,
      width: 50,
      height: 30,
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: value ? colors.accent : colors.line,
        borderRadius: const BorderRadius.all(Radius.circular(10)),
      ),
      child: AnimatedAlign(
        duration: duration,
        curve: Motion.standard,
        alignment: value ? Alignment.centerRight : Alignment.centerLeft,
        child: Container(
          width: 24,
          height: 24,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: const BorderRadius.all(Radius.circular(7)),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF000000).withValues(alpha: 0.15),
                blurRadius: 3,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: AnimatedOpacity(
            duration: duration,
            opacity: value ? 1 : 0,
            child: Glyph(Glyphs.check, size: 16, color: colors.accent),
          ),
        ),
      ),
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
