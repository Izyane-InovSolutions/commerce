import 'package:flutter/widgets.dart';

import 'glyphs.dart';
import 'pressable.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

enum ButtonVariant {
  /// The one action a screen exists for. At most one per screen.
  primary,

  /// Alternatives beside the primary action.
  secondary,

  /// Low-emphasis actions that should not compete: "Forgot password?".
  ghost,

  /// Irreversible actions, only after confirmation.
  danger,
}

enum ButtonSize {
  regular(52, 20, 16),
  compact(40, 14, 14);

  const ButtonSize(this.height, this.padding, this.fontSize);

  final double height;
  final double padding;
  final double fontSize;
}

class Button extends StatelessWidget {
  const Button({
    super.key,
    required this.label,
    required this.onPressed,
    this.variant = ButtonVariant.primary,
    this.size = ButtonSize.regular,
    this.icon,
    this.loading = false,
    this.expand = true,
    this.haptic = Haptic.none,
  });

  final String label;
  final VoidCallback? onPressed;
  final ButtonVariant variant;
  final ButtonSize size;
  final GlyphData? icon;

  /// Shows a spinner in place of the label and ignores taps, while keeping
  /// the button's size so nothing around it moves.
  final bool loading;
  final bool expand;
  final Haptic haptic;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final enabled = onPressed != null && !loading;

    return Pressable(
      onPressed: enabled ? onPressed : null,
      haptic: haptic,
      // While loading, the label says so — and replaces the visible text,
      // which would otherwise be read a second time.
      semanticLabel: loading ? '$label, in progress' : null,
      excludeChildSemantics: loading,
      builder: (context, states) {
        final pressed = states.contains(PressState.pressed);
        final (background, foreground, border) = switch (variant) {
          ButtonVariant.primary => (
            pressed ? colors.accentPressed : colors.accent,
            colors.onAccent,
            null,
          ),
          ButtonVariant.secondary => (colors.surface, colors.ink, colors.line),
          ButtonVariant.ghost => (
            pressed ? colors.accentWash : const Color(0x00000000),
            colors.accent,
            null,
          ),
          ButtonVariant.danger => (colors.dangerWash, colors.danger, null),
        };

        final disabled = !enabled && !loading;
        final textStyle = context.type.label.copyWith(
          fontSize: size.fontSize,
          color: disabled ? colors.inkSubtle : foreground,
        );
        final content = Row(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (icon != null) ...[
              Glyph(icon!, size: size.fontSize + 4, color: textStyle.color),
              const SizedBox(width: Space.x2),
            ],
            Flexible(
              child: Text(
                label,
                style: textStyle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
              ),
            ),
          ],
        );

        return AnimatedContainer(
          duration: Motion.fast,
          curve: Motion.standard,
          constraints: BoxConstraints(
            minHeight: size.height,
            minWidth: expand ? double.infinity : 0,
          ),
          padding: EdgeInsets.symmetric(horizontal: size.padding),
          decoration: BoxDecoration(
            color: disabled && variant == ButtonVariant.primary
                ? colors.line
                : background,
            borderRadius: const BorderRadius.all(Radii.control),
            border: border == null ? null : Border.all(color: border),
          ),
          alignment: Alignment.center,
          child: Stack(
            alignment: Alignment.center,
            children: [
              // The label stays laid out while loading so the width holds.
              Opacity(opacity: loading ? 0 : 1, child: content),
              if (loading) Spinner(size: size.fontSize + 4, color: foreground),
            ],
          ),
        );
      },
    );
  }
}

enum IconButtonVariant { plain, tinted, filled }

/// A 48pt touch target around a glyph. [semanticLabel] is required: an icon
/// alone tells a screen reader nothing.
class IconAction extends StatelessWidget {
  const IconAction({
    super.key,
    required this.icon,
    required this.semanticLabel,
    required this.onPressed,
    this.variant = IconButtonVariant.plain,
    this.color,
    this.haptic = Haptic.none,
    this.size = 24,
    this.active = false,
  });

  final GlyphData icon;

  /// Draws the glyph filled — a saved item's heart.
  final bool active;
  final String semanticLabel;
  final VoidCallback? onPressed;
  final IconButtonVariant variant;
  final Color? color;
  final Haptic haptic;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final foreground = onPressed == null
        ? colors.inkSubtle
        : color ??
              (variant == IconButtonVariant.filled
                  ? colors.onAccent
                  : colors.ink);
    final background = switch (variant) {
      IconButtonVariant.plain => const Color(0x00000000),
      IconButtonVariant.tinted => colors.surface,
      IconButtonVariant.filled => colors.accent,
    };
    return Pressable(
      onPressed: onPressed,
      haptic: haptic,
      semanticLabel: semanticLabel,
      excludeChildSemantics: true,
      focusRadius: const Radius.circular(24),
      pressScale: 0.9,
      builder: (context, _) => SizedBox.square(
        dimension: Space.touch,
        child: Center(
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: background,
              shape: BoxShape.circle,
            ),
            child: Padding(
              padding: EdgeInsets.all(
                variant == IconButtonVariant.plain ? 0 : 8,
              ),
              child: Glyph(icon, size: size, color: foreground, active: active),
            ),
          ),
        ),
      ),
    );
  }
}

/// Inline text action, for secondary links inside copy.
class LinkAction extends StatelessWidget {
  const LinkAction({super.key, required this.label, required this.onPressed});

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) => Pressable(
    onPressed: onPressed,
    focusRadius: Radii.badge,
    builder: (context, _) => Padding(
      padding: const EdgeInsets.symmetric(vertical: Space.x3),
      child: Text(
        label,
        style: context.type.label.copyWith(color: context.colors.accent),
      ),
    ),
  );
}
