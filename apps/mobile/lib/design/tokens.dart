import 'dart:ui';

import 'package:flutter/animation.dart';
import 'package:flutter/painting.dart';

/// The Commerce design tokens.
///
/// The palette has one accent, a steady blue (the brand scheme's primary:
/// `#415F91` light, `#AAC7FF` dark), for the colour that means "you can act
/// here", over the same scheme's cool blue-grey neutrals. Everything else stays quiet so that the price, the loudest element
/// on any screen that has one, can carry it.
///
/// Swapping the brand means editing this file only; no component hard-codes
/// a colour, size or duration. `test/design/design_system_test.dart` checks
/// every text/background pairing against WCAG AA, so a new palette that
/// would be unreadable fails the build rather than shipping.
class Palette {
  const Palette({
    required this.brightness,
    required this.paper,
    required this.surface,
    required this.tile,
    required this.ink,
    required this.inkMuted,
    required this.inkSubtle,
    required this.line,
    required this.accent,
    required this.accentPressed,
    required this.onAccent,
    required this.accentWash,
    required this.danger,
    required this.dangerWash,
    required this.warning,
    required this.warningWash,
    required this.star,
    required this.scrim,
    required this.dock,
    required this.onDock,
    required this.onDockMuted,
    required this.dockAccent,
  });

  final Brightness brightness;

  /// The page itself.
  final Color paper;

  /// Grouped lists, fields and sheets — content that needs a container.
  final Color surface;

  /// Behind product images, so a transparent PNG still reads as a tile.
  final Color tile;

  final Color ink;
  final Color inkMuted;

  /// Placeholders and disabled content only; too faint for body text.
  final Color inkSubtle;
  final Color line;

  final Color accent;
  final Color accentPressed;
  final Color onAccent;

  /// Selected chips, the tab indicator, confirmation surfaces.
  final Color accentWash;

  final Color danger;
  final Color dangerWash;

  /// Pending states — above all, "awaiting payment".
  final Color warning;
  final Color warningWash;
  final Color star;
  final Color scrim;

  /// The floating tab dock and top notices: a raised surface that follows
  /// the theme — white over the light page, a lifted green-black over the
  /// dark one — set apart by its shadow and floating shape, not by colour.
  final Color dock;
  final Color onDock;
  final Color onDockMuted;

  /// "You are here" on the dock — the accent, which reads on [dock] in both
  /// modes.
  final Color dockAccent;

  static const light = Palette(
    brightness: Brightness.light,
    paper: Color(0xFFF3F3FA),
    surface: Color(0xFFFFFFFF),
    tile: Color(0xFFE7E8EE),
    ink: Color(0xFF191C20),
    inkMuted: Color(0xFF44474E),
    inkSubtle: Color(0xFF74777F),
    line: Color(0xFFC4C6D0),
    accent: Color(0xFF415F91),
    accentPressed: Color(0xFF284777),
    onAccent: Color(0xFFFFFFFF),
    accentWash: Color(0xFFD6E3FF),
    danger: Color(0xFFB5361F),
    dangerWash: Color(0xFFF8E1DC),
    warning: Color(0xFF8F5A00),
    warningWash: Color(0xFFF6EACB),
    star: Color(0xFFD99A06),
    scrim: Color(0x73191C20),
    dock: Color(0xFFFFFFFF),
    onDock: Color(0xFF191C20),
    onDockMuted: Color(0xFF44474E),
    dockAccent: Color(0xFF415F91),
  );

  static const dark = Palette(
    brightness: Brightness.dark,
    paper: Color(0xFF111318),
    surface: Color(0xFF1D2024),
    tile: Color(0xFF282A2F),
    ink: Color(0xFFE2E2E9),
    inkMuted: Color(0xFFC4C6D0),
    inkSubtle: Color(0xFF8E9099),
    line: Color(0xFF44474E),
    accent: Color(0xFFAAC7FF),
    accentPressed: Color(0xFFD6E3FF),
    onAccent: Color(0xFF0A305F),
    accentWash: Color(0xFF284777),
    danger: Color(0xFFF07A63),
    dangerWash: Color(0xFF3A1A14),
    warning: Color(0xFFE3A73A),
    warningWash: Color(0xFF33260C),
    star: Color(0xFFF2B705),
    scrim: Color(0x99000000),
    dock: Color(0xFF33353A),
    onDock: Color(0xFFE2E2E9),
    onDockMuted: Color(0xFFC4C6D0),
    dockAccent: Color(0xFFAAC7FF),
  );
}

/// A 1.2 scale on a 16px body, set in one family. Weights go through the
/// variable font's `wght` axis: `FontWeight` alone does not select a
/// variable instance reliably on every engine.
class TypeScale {
  const TypeScale(this.color);

  static const family = 'Schibsted Grotesk';

  final Color color;

  TextStyle _style(
    double size,
    double height,
    int weight, {
    double tracking = 0,
    List<FontFeature> features = const [],
  }) => TextStyle(
    fontFamily: family,
    fontSize: size,
    height: height / size,
    letterSpacing: tracking,
    fontWeight: FontWeight.values[((weight / 100).round() - 1).clamp(0, 8)],
    fontVariations: [FontVariation('wght', weight.toDouble())],
    fontFeatures: features,
    color: color,
    leadingDistribution: TextLeadingDistribution.even,
  );

  /// Large page titles.
  TextStyle get display => _style(34, 40, 760, tracking: -0.8);
  TextStyle get title => _style(24, 30, 720, tracking: -0.4);
  TextStyle get heading => _style(19, 25, 660, tracking: -0.2);
  TextStyle get body => _style(16, 23, 420);
  TextStyle get bodyStrong => _style(16, 23, 600);
  TextStyle get label => _style(15, 20, 620);
  TextStyle get small => _style(14, 19, 420);
  TextStyle get caption => _style(12.5, 16, 520, tracking: 0.1);

  /// Prices and quantities: tabular, so columns of amounts line up and a
  /// changing total does not jitter.
  TextStyle figures(double size, int weight) => _style(
    size,
    size * 1.1,
    weight,
    tracking: -0.3,
    features: const [FontFeature.tabularFigures()],
  );
}

/// A 4-point grid.
class Space {
  const Space._();
  static const x1 = 4.0;
  static const x2 = 8.0;
  static const x3 = 12.0;
  static const x4 = 16.0;
  static const x5 = 20.0;
  static const x6 = 24.0;
  static const x8 = 32.0;
  static const x10 = 40.0;

  /// Page side margins.
  static const gutter = 20.0;

  /// Smallest comfortable touch target (Material 48, Cupertino 44).
  static const touch = 48.0;
}

/// Radii encode size: the bigger the surface, the rounder the corner, so the
/// hierarchy reads even at a glance. One radius on everything is avoided on
/// purpose.
class Radii {
  const Radii._();
  static const badge = Radius.circular(6);
  static const chip = Radius.circular(10);
  static const control = Radius.circular(14);
  static const tile = Radius.circular(16);
  static const group = Radius.circular(20);
  static const sheet = Radius.circular(28);
}

class Motion {
  const Motion._();
  static const fast = Duration(milliseconds: 120);
  static const base = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 360);

  /// Material's emphasised easing: quick start, long settle.
  static const standard = Cubic(0.2, 0, 0, 1);

  /// Cupertino's feel for things that arrive (sheets, toasts).
  static const arrive = Curves.fastLinearToSlowEaseIn;

  /// How far a control sinks while pressed.
  static const pressScale = 0.97;
}
