import 'package:flutter/cupertino.dart'
    show
        CupertinoAdaptiveTextSelectionToolbar,
        cupertinoTextSelectionHandleControls;
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart'
    show AdaptiveTextSelectionToolbar, materialTextSelectionHandleControls;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'theme.dart';
import 'tokens.dart';

bool get _isApple =>
    defaultTargetPlatform == TargetPlatform.iOS ||
    defaultTargetPlatform == TargetPlatform.macOS;

/// A text input built on [EditableText].
///
/// The field's look is the design system's: a label that stays put above the
/// box (a floating label hides what was asked the moment you type), a box
/// that turns accent on focus and danger on error. Its *behaviour* is each
/// platform's own: selection handles, the copy/paste menu, force-press and
/// the cursor are borrowed from Cupertino on Apple platforms and Material
/// elsewhere, because those are muscle memory and not a place for novelty.
class InputField extends StatefulWidget {
  const InputField({
    super.key,
    required this.controller,
    this.label,
    this.hint,
    this.helper,
    this.error,
    this.focusNode,
    this.leading,
    this.trailing,
    this.keyboardType,
    this.textInputAction,
    this.textCapitalization = TextCapitalization.none,
    this.autofillHints,
    this.obscureText = false,
    this.autocorrect = true,
    this.enabled = true,
    this.autofocus = false,
    this.onChanged,
    this.onSubmitted,
    this.inputFormatters,
    this.dense = false,
  });

  final TextEditingController controller;
  final String? label;
  final String? hint;
  final String? helper;
  final String? error;
  final FocusNode? focusNode;
  final IconData? leading;
  final Widget? trailing;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final TextCapitalization textCapitalization;
  final Iterable<String>? autofillHints;
  final bool obscureText;
  final bool autocorrect;
  final bool enabled;
  final bool autofocus;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final List<TextInputFormatter>? inputFormatters;

  /// A shorter box without a label — for search in a top bar.
  final bool dense;

  @override
  State<InputField> createState() => _InputFieldState();
}

class _InputFieldState extends State<InputField>
    implements TextSelectionGestureDetectorBuilderDelegate {
  @override
  final GlobalKey<EditableTextState> editableTextKey =
      GlobalKey<EditableTextState>();

  @override
  bool get forcePressEnabled => _isApple;

  @override
  bool get selectionEnabled => widget.enabled;

  late final _gestures = TextSelectionGestureDetectorBuilder(delegate: this);
  FocusNode? _ownFocus;
  FocusNode get _focus => widget.focusNode ?? (_ownFocus ??= FocusNode());

  @override
  void initState() {
    super.initState();
    _focus.addListener(_rebuild);
    widget.controller.addListener(_rebuild);
  }

  @override
  void didUpdateWidget(InputField oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.controller != widget.controller) {
      oldWidget.controller.removeListener(_rebuild);
      widget.controller.addListener(_rebuild);
    }
  }

  @override
  void dispose() {
    _focus.removeListener(_rebuild);
    widget.controller.removeListener(_rebuild);
    _ownFocus?.dispose();
    super.dispose();
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final type = context.type;
    final focused = _focus.hasFocus;
    final hasError = widget.error != null;
    final borderColor = hasError
        ? colors.danger
        : focused
        ? colors.accent
        : colors.line;

    final style = type.body.copyWith(
      color: widget.enabled ? colors.ink : colors.inkMuted,
    );

    final editable = EditableText(
      key: editableTextKey,
      controller: widget.controller,
      focusNode: _focus,
      style: style,
      cursorColor: colors.accent,
      backgroundCursorColor: colors.inkSubtle,
      selectionColor: colors.accent.withValues(alpha: 0.24),
      cursorWidth: 2,
      cursorRadius: const Radius.circular(2),
      cursorOpacityAnimates: _isApple,
      keyboardType: widget.keyboardType,
      textInputAction: widget.textInputAction,
      textCapitalization: widget.textCapitalization,
      autofillHints: widget.enabled ? widget.autofillHints : null,
      obscureText: widget.obscureText,
      autocorrect: widget.autocorrect && !widget.obscureText,
      enableSuggestions: !widget.obscureText,
      readOnly: !widget.enabled,
      autofocus: widget.autofocus,
      maxLines: 1,
      inputFormatters: widget.inputFormatters,
      onChanged: widget.onChanged,
      onSubmitted: widget.onSubmitted,
      // Mobile keyboards cover half the screen; tapping away dismisses one,
      // as it does across iOS.
      onTapOutside: (_) => _focus.unfocus(),
      rendererIgnoresPointer: true,
      selectionControls: widget.enabled
          ? (_isApple
                ? cupertinoTextSelectionHandleControls
                : materialTextSelectionHandleControls)
          : null,
      contextMenuBuilder: (context, state) => _isApple
          ? CupertinoAdaptiveTextSelectionToolbar.editableText(
              editableTextState: state,
            )
          : AdaptiveTextSelectionToolbar.editableText(editableTextState: state),
    );

    final box = GestureDetector(
      // Taps on the box's padding focus the field too, not just taps on text.
      onTap: widget.enabled ? _focus.requestFocus : null,
      child: AnimatedContainer(
        duration: Motion.fast,
        curve: Motion.standard,
        constraints: BoxConstraints(minHeight: widget.dense ? 44 : 52),
        padding: const EdgeInsets.symmetric(horizontal: Space.x4),
        decoration: BoxDecoration(
          color: widget.enabled ? colors.surface : colors.tile,
          borderRadius: const BorderRadius.all(Radii.control),
          border: Border.all(
            color: borderColor,
            width: focused || hasError ? 1.8 : 1,
          ),
        ),
        child: Row(
          children: [
            if (widget.leading != null) ...[
              Icon(
                widget.leading,
                size: 20,
                color: focused ? colors.accent : colors.inkMuted,
              ),
              const SizedBox(width: Space.x3),
            ],
            Expanded(
              child: Stack(
                alignment: AlignmentDirectional.centerStart,
                children: [
                  if (widget.hint != null && widget.controller.text.isEmpty)
                    IgnorePointer(
                      child: Text(
                        widget.hint!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: style.copyWith(color: colors.inkSubtle),
                      ),
                    ),
                  _gestures.buildGestureDetector(
                    behavior: HitTestBehavior.translucent,
                    child: editable,
                  ),
                ],
              ),
            ),
            if (widget.trailing != null) widget.trailing!,
          ],
        ),
      ),
    );

    final below = widget.error ?? widget.helper;
    return MergeSemantics(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (widget.label != null && !widget.dense) ...[
            Text(
              widget.label!,
              style: type.small.copyWith(
                color: hasError ? colors.danger : colors.inkMuted,
                fontVariations: const [FontVariation('wght', 560)],
              ),
            ),
            const SizedBox(height: Space.x2),
          ],
          box,
          if (below != null) ...[
            const SizedBox(height: Space.x1 + 2),
            Text(
              below,
              style: type.caption.copyWith(
                color: hasError ? colors.danger : colors.inkMuted,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// [InputField] inside a [Form]: runs [validator] on submit and shows its
/// message, or [serverError] — a message the API returned for this field.
class InputFormField extends FormField<String> {
  InputFormField({
    super.key,
    required TextEditingController controller,
    String? Function(String value)? validator,
    String? serverError,
    String? label,
    String? hint,
    String? helper,
    IconData? leading,
    Widget? trailing,
    TextInputType? keyboardType,
    TextInputAction? textInputAction,
    TextCapitalization textCapitalization = TextCapitalization.none,
    Iterable<String>? autofillHints,
    bool obscureText = false,
    bool autocorrect = true,
    bool enabled = true,
    ValueChanged<String>? onSubmitted,
    ValueChanged<String>? onChanged,
  }) : super(
         initialValue: controller.text,
         // Validate the controller, not FormField's copy: the controller is
         // the source of truth when a screen fills it in after loading.
         validator: validator == null
             ? null
             : (_) => validator(controller.text),
         builder: (field) => InputField(
           controller: controller,
           label: label,
           hint: hint,
           helper: helper,
           error: field.errorText ?? serverError,
           leading: leading,
           trailing: trailing,
           keyboardType: keyboardType,
           textInputAction: textInputAction,
           textCapitalization: textCapitalization,
           autofillHints: autofillHints,
           obscureText: obscureText,
           autocorrect: autocorrect,
           enabled: enabled,
           onSubmitted: onSubmitted,
           onChanged: (value) {
             field.didChange(value);
             onChanged?.call(value);
           },
         ),
       );
}
