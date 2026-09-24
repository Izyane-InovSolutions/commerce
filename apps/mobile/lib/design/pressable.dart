import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'theme.dart';
import 'tokens.dart';

enum PressState { pressed, hovered, focused, disabled, selected }

enum Haptic { none, selection, light, medium }

/// The behaviour under every tappable thing in the design system.
///
/// From Cupertino: the control sinks and dims while held, so a tap is
/// acknowledged before anything loads. From Material: a visible focus ring
/// for keyboard and switch access, and hover state for pointers. Semantics,
/// Enter/Space activation and optional haptics are handled here once, so no
/// component can forget them.
class Pressable extends StatefulWidget {
  const Pressable({
    super.key,
    required this.onPressed,
    required this.builder,
    this.semanticLabel,
    this.selected,
    this.haptic = Haptic.none,
    this.focusRadius = Radii.control,
    this.pressScale = Motion.pressScale,
    this.dimOnPress = true,
    this.excludeChildSemantics = false,
  });

  final VoidCallback? onPressed;
  final Widget Function(BuildContext context, Set<PressState> states) builder;

  /// Announced by screen readers. When null the child's own text is used.
  final String? semanticLabel;
  final bool? selected;
  final Haptic haptic;
  final Radius focusRadius;
  final double pressScale;
  final bool dimOnPress;
  final bool excludeChildSemantics;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _pressed = false;
  bool _hovered = false;
  bool _focused = false;

  bool get _enabled => widget.onPressed != null;

  void _activate() {
    if (!_enabled) return;
    switch (widget.haptic) {
      case Haptic.none:
        break;
      case Haptic.selection:
        HapticFeedback.selectionClick();
      case Haptic.light:
        HapticFeedback.lightImpact();
      case Haptic.medium:
        HapticFeedback.mediumImpact();
    }
    widget.onPressed!();
  }

  void _setPressed(bool value) {
    if (_pressed != value && mounted) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final states = <PressState>{
      if (_pressed) PressState.pressed,
      if (_hovered) PressState.hovered,
      if (_focused) PressState.focused,
      if (!_enabled) PressState.disabled,
      if (widget.selected ?? false) PressState.selected,
    };
    final reduce = context.reduceMotion;
    final colors = context.colors;

    // Only a keyboard-driven focus gets the ring; a finger tap does not.
    final showRing =
        _focused &&
        FocusManager.instance.highlightMode == FocusHighlightMode.traditional;

    Widget child = widget.builder(context, states);
    child = AnimatedOpacity(
      opacity: _pressed && widget.dimOnPress ? 0.72 : 1,
      duration: Motion.fast,
      child: AnimatedScale(
        scale: _pressed && !reduce ? widget.pressScale : 1,
        duration: Motion.fast,
        curve: Motion.standard,
        child: child,
      ),
    );

    child = DecoratedBox(
      position: DecorationPosition.foreground,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.all(widget.focusRadius),
        border: showRing
            ? Border.all(color: colors.accent, width: 2.5)
            : Border.all(color: const Color(0x00000000), width: 2.5),
      ),
      child: child,
    );

    return Semantics(
      button: true,
      enabled: _enabled,
      selected: widget.selected,
      label: widget.semanticLabel,
      excludeSemantics: widget.excludeChildSemantics,
      onTap: _enabled ? _activate : null,
      child: FocusableActionDetector(
        enabled: _enabled,
        onShowFocusHighlight: (value) => setState(() => _focused = value),
        onShowHoverHighlight: (value) => setState(() => _hovered = value),
        mouseCursor: _enabled
            ? SystemMouseCursors.click
            : SystemMouseCursors.basic,
        actions: {
          ActivateIntent: CallbackAction<ActivateIntent>(
            onInvoke: (_) => _activate(),
          ),
        },
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          excludeFromSemantics: true,
          onTapDown: _enabled ? (_) => _setPressed(true) : null,
          onTapUp: _enabled ? (_) => _setPressed(false) : null,
          onTapCancel: _enabled ? () => _setPressed(false) : null,
          onTap: _enabled ? _activate : null,
          child: child,
        ),
      ),
    );
  }
}
