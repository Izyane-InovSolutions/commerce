import 'dart:async';
import 'glyphs.dart';
import 'dart:ui' show ImageFilter;

import 'package:flutter/semantics.dart';
import 'package:flutter/widgets.dart';

import 'button.dart';
import 'lists.dart';
import 'pressable.dart';
import 'theme.dart';
import 'tokens.dart';

// ---------------------------------------------------------------- toasts

class _ToastData {
  const _ToastData(this.message, this.actionLabel, this.onAction, this.id);

  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;
  final int id;
}

/// Hosts the app's toasts above every route. Put it in the app's builder.
class ToastHost extends StatefulWidget {
  const ToastHost({super.key, required this.child});

  final Widget child;

  @override
  State<ToastHost> createState() => ToastHostState();
}

class ToastHostState extends State<ToastHost> {
  _ToastData? _current;
  Timer? _timer;
  int _seq = 0;

  void show(String message, {String? actionLabel, VoidCallback? onAction}) {
    _timer?.cancel();
    setState(
      () => _current = _ToastData(message, actionLabel, onAction, ++_seq),
    );
    // Toasts are transient; make sure a screen-reader user still hears it.
    SemanticsService.sendAnnouncement(
      View.of(context),
      message,
      Directionality.of(context),
    );
    _timer = Timer(
      Duration(milliseconds: actionLabel == null ? 3200 : 5000),
      hide,
    );
  }

  void hide() {
    _timer?.cancel();
    if (mounted) setState(() => _current = null);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final toast = _current;
    final top = MediaQuery.paddingOf(context).top;
    return Stack(
      children: [
        widget.child,
        // From the top, under the status bar: clear of the dock and of any
        // pinned pay bar, and nowhere a platform puts its own snackbar.
        Positioned(
          left: Space.gutter,
          right: Space.gutter,
          top: top + Space.x2,
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: AnimatedSwitcher(
                duration: context.reduceMotion ? Duration.zero : Motion.base,
                switchInCurve: Motion.arrive,
                transitionBuilder: (child, animation) => FadeTransition(
                  opacity: animation,
                  child: SlideTransition(
                    position: Tween(
                      begin: const Offset(0, -0.6),
                      end: Offset.zero,
                    ).animate(animation),
                    child: child,
                  ),
                ),
                child: toast == null
                    ? const SizedBox.shrink()
                    : _Toast(
                        key: ValueKey(toast.id),
                        data: toast,
                        onDismiss: hide,
                      ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Toast extends StatelessWidget {
  const _Toast({super.key, required this.data, required this.onDismiss});

  final _ToastData data;
  final VoidCallback onDismiss;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    // The dock's colours: a notice is part of the app's frame, and must
    // read against whatever screen it lands on.
    return Semantics(
      liveRegion: true,
      child: GestureDetector(
        // Flick it away upwards, back where it came from.
        onVerticalDragEnd: (details) {
          if ((details.primaryVelocity ?? 0) < 0) onDismiss();
        },
        onTap: data.actionLabel == null ? onDismiss : null,
        child: Container(
          padding: const EdgeInsets.fromLTRB(
            Space.x5,
            Space.x3,
            Space.x2,
            Space.x3,
          ),
          decoration: BoxDecoration(
            color: colors.dock,
            borderRadius: const BorderRadius.all(Radius.circular(24)),
            border: Border.all(color: colors.line, width: 0.8),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF000000).withValues(
                  alpha: colors.brightness == Brightness.dark ? 0.4 : 0.1,
                ),
                blurRadius: 20,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  data.message,
                  style: context.type.small.copyWith(color: colors.onDock),
                ),
              ),
              if (data.actionLabel != null)
                Pressable(
                  onPressed: () {
                    onDismiss();
                    data.onAction?.call();
                  },
                  focusRadius: Radii.badge,
                  builder: (context, _) => Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: Space.x3,
                      vertical: Space.x2,
                    ),
                    child: Text(
                      data.actionLabel!,
                      style: context.type.label.copyWith(
                        color: colors.dockAccent,
                      ),
                    ),
                  ),
                )
              else
                const SizedBox(width: Space.x3),
            ],
          ),
        ),
      ),
    );
  }
}

extension Toasts on BuildContext {
  void toast(String message, {String? actionLabel, VoidCallback? onAction}) {
    findAncestorStateOfType<ToastHostState>()?.show(
      message,
      actionLabel: actionLabel,
      onAction: onAction,
    );
  }
}

// ---------------------------------------------------------------- dialog

/// Asks before something that cannot be undone. Returns true on confirm.
Future<bool> confirm(
  BuildContext context, {
  required String title,
  String? message,
  required String confirmLabel,
  bool destructive = false,
  String cancelLabel = 'Cancel',
}) async {
  final result = await showGeneralDialog<bool>(
    context: context,
    barrierDismissible: true,
    barrierLabel: cancelLabel,
    barrierColor: context.colors.scrim,
    transitionDuration: context.reduceMotion ? Duration.zero : Motion.base,
    // Cupertino's alert entrance: a slight scale-up as it fades in.
    transitionBuilder: (context, animation, _, child) => FadeTransition(
      opacity: animation,
      child: ScaleTransition(
        scale: Tween(
          begin: 1.06,
          end: 1.0,
        ).animate(CurvedAnimation(parent: animation, curve: Motion.standard)),
        child: child,
      ),
    ),
    pageBuilder: (context, _, _) {
      final colors = context.colors;
      return SafeArea(
        child: Center(
          child: Padding(
            padding: const EdgeInsets.all(Space.x8),
            child: Semantics(
              scopesRoute: true,
              namesRoute: true,
              label: title,
              child: Container(
                constraints: const BoxConstraints(maxWidth: 360),
                padding: const EdgeInsets.all(Space.x6),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: const BorderRadius.all(Radii.group),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(title, style: context.type.heading),
                    if (message != null) ...[
                      const SizedBox(height: Space.x2),
                      Text(
                        message,
                        style: context.type.body.copyWith(
                          color: colors.inkMuted,
                        ),
                      ),
                    ],
                    const SizedBox(height: Space.x6),
                    Button(
                      label: confirmLabel,
                      variant: destructive
                          ? ButtonVariant.danger
                          : ButtonVariant.primary,
                      onPressed: () => Navigator.of(context).pop(true),
                    ),
                    const SizedBox(height: Space.x2),
                    Button(
                      label: cancelLabel,
                      variant: ButtonVariant.ghost,
                      onPressed: () => Navigator.of(context).pop(false),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
  return result ?? false;
}

// ---------------------------------------------------------------- sheet

/// A bottom sheet: slides up over a scrim, dismisses by dragging down or
/// tapping outside. Drag drives the route's own animation, so a flick feels
/// continuous with the dismissal.
class SheetRoute<T> extends PopupRoute<T> {
  SheetRoute({required this.builder, required this.scrim, this.label});

  final WidgetBuilder builder;
  final Color scrim;
  final String? label;

  @override
  Color? get barrierColor => scrim;

  @override
  bool get barrierDismissible => true;

  @override
  String? get barrierLabel => label ?? 'Close';

  @override
  Duration get transitionDuration => Motion.slow;

  @override
  Duration get reverseTransitionDuration => Motion.base;

  /// Moves the sheet with a finger; [fraction] is the share of its height.
  void dragBy(double fraction) => controller!.value -= fraction;

  /// Ends a drag: dismiss if flung or dragged most of the way, else settle.
  void endDrag({required bool flung}) {
    if (flung || controller!.value < 0.6) {
      navigator?.pop();
    } else {
      controller!.forward();
    }
  }

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return _Sheet(
      route: this,
      child: Builder(builder: builder),
    );
  }

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: Motion.arrive,
      reverseCurve: Motion.standard,
    );
    return Align(
      alignment: Alignment.bottomCenter,
      child: SlideTransition(
        position: Tween(
          begin: const Offset(0, 1),
          end: Offset.zero,
        ).animate(context.reduceMotion ? animation : curved),
        child: child,
      ),
    );
  }
}

class _Sheet extends StatefulWidget {
  const _Sheet({required this.route, required this.child});

  final SheetRoute<dynamic> route;
  final Widget child;

  @override
  State<_Sheet> createState() => _SheetState();
}

class _SheetState extends State<_Sheet> {
  final _key = GlobalKey();

  double get _height =>
      (_key.currentContext?.findRenderObject() as RenderBox?)?.size.height ??
      400;

  void _drag(DragUpdateDetails details) =>
      widget.route.dragBy(details.primaryDelta! / _height);

  void _end(DragEndDetails details) =>
      widget.route.endDrag(flung: details.velocity.pixelsPerSecond.dy > 700);

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final media = MediaQuery.of(context);
    return Semantics(
      scopesRoute: true,
      namesRoute: true,
      explicitChildNodes: true,
      label: widget.route.label,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: media.size.height * 0.88),
        child: Container(
          key: _key,
          decoration: BoxDecoration(
            color: colors.paper,
            borderRadius: const BorderRadius.vertical(top: Radii.sheet),
          ),
          padding: EdgeInsets.only(
            bottom: media.viewInsets.bottom + media.padding.bottom + Space.x3,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onVerticalDragUpdate: _drag,
                onVerticalDragEnd: _end,
                child: SizedBox(
                  width: double.infinity,
                  height: 28,
                  child: Center(
                    child: Container(
                      width: 40,
                      height: 5,
                      decoration: BoxDecoration(
                        color: colors.line,
                        borderRadius: const BorderRadius.all(
                          Radius.circular(3),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Flexible(child: widget.child),
            ],
          ),
        ),
      ),
    );
  }
}

Future<T?> showSheet<T>(
  BuildContext context, {
  required WidgetBuilder builder,
  String? label,
}) {
  return Navigator.of(context, rootNavigator: true).push(
    SheetRoute<T>(builder: builder, scrim: context.colors.scrim, label: label),
  );
}

class SheetOption<T> {
  const SheetOption(
    this.value,
    this.label, {
    this.subtitle,
    this.icon,
    this.destructive = false,
  });

  final T value;
  final String label;
  final String? subtitle;
  final GlyphData? icon;
  final bool destructive;
}

/// Cupertino's action sheet pattern: a titled list of choices, the current
/// one checked. Replaces pop-up menus and dropdowns, which are small targets
/// that fight a thumb on a phone.
Future<T?> chooseOption<T>(
  BuildContext context, {
  required String title,
  required List<SheetOption<T>> options,
  T? selected,
}) {
  return showSheet<T>(
    context,
    label: title,
    builder: (context) => SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(
        Space.gutter,
        0,
        Space.gutter,
        Space.x2,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: Space.x4, left: Space.x1),
            child: Text(title, style: context.type.heading),
          ),
          InsetGroup(
            children: [
              for (final option in options)
                ListRow(
                  title: option.label,
                  subtitle: option.subtitle,
                  leading: option.icon,
                  destructive: option.destructive,
                  selected: selected == null ? null : option.value == selected,
                  showChevron: false,
                  onPressed: () => Navigator.of(context).pop(option.value),
                ),
            ],
          ),
        ],
      ),
    ),
  );
}

/// Frosted glass, from Cupertino's bars: whatever scrolls beneath stays
/// faintly visible, so the chrome feels light without losing legibility.
class Frosted extends StatelessWidget {
  const Frosted({
    super.key,
    required this.child,
    this.border = BorderSide.none,
  });

  final Widget child;
  final BorderSide border;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.paper.withValues(alpha: 0.82),
            border: Border(top: border),
          ),
          child: child,
        ),
      ),
    );
  }
}
