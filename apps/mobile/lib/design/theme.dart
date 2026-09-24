import 'package:flutter/widgets.dart';

import 'tokens.dart';

class DesignTheme {
  const DesignTheme._(this.palette, this.type);

  factory DesignTheme.of(Palette palette) =>
      DesignTheme._(palette, TypeScale(palette.ink));

  final Palette palette;
  final TypeScale type;

  bool get isDark => palette.brightness == Brightness.dark;
}

/// Provides the design theme below it. Components read it with
/// `context.ds`; nothing else in the app should know a colour value.
class DesignScope extends InheritedWidget {
  const DesignScope({super.key, required this.theme, required super.child});

  final DesignTheme theme;

  static DesignTheme of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<DesignScope>();
    return scope?.theme ?? DesignTheme.of(Palette.light);
  }

  @override
  bool updateShouldNotify(DesignScope oldWidget) =>
      theme.palette != oldWidget.theme.palette;
}

extension DesignContext on BuildContext {
  DesignTheme get ds => DesignScope.of(this);
  Palette get colors => DesignScope.of(this).palette;
  TypeScale get type => DesignScope.of(this).type;

  /// Respect the system's reduce-motion setting in every animation.
  bool get reduceMotion => MediaQuery.maybeDisableAnimationsOf(this) ?? false;
}
