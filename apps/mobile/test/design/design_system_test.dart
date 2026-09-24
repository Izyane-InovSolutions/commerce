import 'dart:math' as math;

import 'package:commerce_mobile/design/design.dart';
import 'package:flutter/cupertino.dart' show DefaultCupertinoLocalizations;
import 'package:flutter/material.dart' show DefaultMaterialLocalizations;
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

double _luminance(Color c) {
  double channel(double v) =>
      v <= 0.03928 ? v / 12.92 : math.pow((v + 0.055) / 1.055, 2.4).toDouble();
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

double contrast(Color a, Color b) {
  final la = _luminance(a), lb = _luminance(b);
  return (math.max(la, lb) + 0.05) / (math.min(la, lb) + 0.05);
}

/// A real app shell, as components get in production: WidgetsApp supplies
/// the Enter/Space activation shortcuts, focus traversal, the Overlay that
/// text selection needs, and localizations.
Widget host(Widget child, {Palette palette = Palette.light}) => WidgetsApp(
  color: palette.accent,
  localizationsDelegates: const [
    DefaultWidgetsLocalizations.delegate,
    DefaultMaterialLocalizations.delegate,
    DefaultCupertinoLocalizations.delegate,
  ],
  pageRouteBuilder: <T>(settings, builder) => PageRouteBuilder<T>(
    settings: settings,
    pageBuilder: (context, _, _) => builder(context),
  ),
  home: DesignScope(
    theme: DesignTheme.of(palette),
    child: Center(child: child),
  ),
);

void main() {
  group('palette contrast (WCAG AA: 4.5 for text, 3 for large text/UI)', () {
    for (final palette in [Palette.light, Palette.dark]) {
      final name = palette.brightness.name;
      final pairs = <String, (Color, Color, double)>{
        'ink on paper': (palette.ink, palette.paper, 4.5),
        'ink on surface': (palette.ink, palette.surface, 4.5),
        'muted text on paper': (palette.inkMuted, palette.paper, 4.5),
        'muted text on surface': (palette.inkMuted, palette.surface, 4.5),
        'accent text on paper': (palette.accent, palette.paper, 4.5),
        'accent text on surface': (palette.accent, palette.surface, 4.5),
        'button label on accent': (palette.onAccent, palette.accent, 4.5),
        'accent on its wash (chips, badges)': (
          palette.accent,
          palette.accentWash,
          4.5,
        ),
        'danger on its wash': (palette.danger, palette.dangerWash, 4.5),
        'warning on its wash': (palette.warning, palette.warningWash, 4.5),
        'danger text on surface': (palette.danger, palette.surface, 4.5),
        'toast text (inverted)': (palette.paper, palette.ink, 4.5),
      };
      pairs.forEach((label, pair) {
        test('$name: $label', () {
          final ratio = contrast(pair.$1, pair.$2);
          expect(
            ratio,
            greaterThanOrEqualTo(pair.$3),
            reason: '$label is ${ratio.toStringAsFixed(2)}:1',
          );
        });
      });
    }
  });

  group('Price', () {
    testWidgets('reads as one amount although drawn in three parts', (
      tester,
    ) async {
      await tester.pumpWidget(host(const Price(450000, 'ZMW')));
      expect(find.bySemanticsLabel('K4,500.00'), findsOneWidget);
      expect(find.text('K'), findsOneWidget);
      expect(find.text('4,500'), findsOneWidget);
      expect(find.text('00'), findsOneWidget);
    });

    testWidgets('shows a negative amount', (tester) async {
      await tester.pumpWidget(host(const Price(-2500, 'ZMW')));
      expect(find.bySemanticsLabel('-K25.00'), findsOneWidget);
    });
  });

  group('Button', () {
    testWidgets('is announced as a button and fires once per tap', (
      tester,
    ) async {
      var taps = 0;
      await tester.pumpWidget(
        host(Button(label: 'Pay', onPressed: () => taps++)),
      );
      await tester.tap(find.text('Pay'));
      expect(taps, 1);
      expect(
        tester.getSemantics(find.byType(Button)),
        isSemantics(isButton: true, isEnabled: true, hasTapAction: true),
      );
    });

    testWidgets('while loading keeps its width and ignores taps', (
      tester,
    ) async {
      var taps = 0;
      Widget build(bool loading) => host(
        SizedBox(
          width: 300,
          child: Button(
            label: 'Pay',
            loading: loading,
            onPressed: () => taps++,
          ),
        ),
      );
      await tester.pumpWidget(build(false));
      final idle = tester.getSize(find.byType(Button));

      await tester.pumpWidget(build(true));
      expect(tester.getSize(find.byType(Button)), idle);
      expect(find.byType(Spinner), findsOneWidget);
      await tester.tap(find.byType(Button));
      expect(taps, 0);
      expect(find.bySemanticsLabel('Pay, in progress'), findsOneWidget);
    });

    testWidgets('can be activated from a keyboard', (tester) async {
      var taps = 0;
      await tester.pumpWidget(
        host(Button(label: 'Pay', onPressed: () => taps++)),
      );
      // Tab to the button the way a keyboard or switch user would.
      await tester.sendKeyEvent(LogicalKeyboardKey.tab);
      await tester.pump();
      await tester.sendKeyEvent(LogicalKeyboardKey.enter);
      expect(taps, 1);
    });
  });

  group('InputField', () {
    testWidgets(
      'shows the label, merges it with the field and reports errors',
      (tester) async {
        final controller = TextEditingController();
        await tester.pumpWidget(
          host(
            SizedBox(
              width: 320,
              child: InputField(
                controller: controller,
                label: 'Email',
                error: 'Enter a valid email',
              ),
            ),
          ),
        );
        expect(find.text('Email'), findsOneWidget);
        expect(find.text('Enter a valid email'), findsOneWidget);

        await tester.enterText(find.byType(InputField), 'buyer@example.test');
        expect(controller.text, 'buyer@example.test');
      },
    );

    testWidgets('hides its hint once there is text', (tester) async {
      final controller = TextEditingController();
      await tester.pumpWidget(
        host(
          SizedBox(
            width: 320,
            child: InputField(controller: controller, hint: 'Search products'),
          ),
        ),
      );
      expect(find.text('Search products'), findsOneWidget);
      await tester.enterText(find.byType(InputField), 'earbuds');
      await tester.pump();
      expect(find.text('Search products'), findsNothing);
    });
  });

  testWidgets('SegmentedChoice selects and announces the selection', (
    tester,
  ) async {
    var value = 'mtn';
    await tester.pumpWidget(
      host(
        StatefulBuilder(
          builder: (context, setState) => SizedBox(
            width: 320,
            child: SegmentedChoice<String>(
              options: const {'mtn': 'MTN MoMo', 'airtel': 'Airtel Money'},
              value: value,
              onChanged: (v) => setState(() => value = v),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Airtel Money'));
    await tester.pumpAndSettle();
    expect(value, 'airtel');
    expect(
      tester.getSemantics(find.text('Airtel Money')),
      isSemantics(isSelected: true, isButton: true),
    );
  });
}
