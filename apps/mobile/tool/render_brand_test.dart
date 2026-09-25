// Renders the brand images — app icon, Android adaptive foreground, splash
// wordmark — from the design system itself, so they match the app exactly.
//
//   flutter test tool/render_brand_test.dart
//
// Writes PNGs to build/brand/. `tool/brand_assets.sh` then sizes them for
// iOS and Android and puts them in place.
import 'dart:io';
import 'dart:ui' as ui;

import 'package:commerce_mobile/app/brand.dart';
import 'package:commerce_mobile/features/auth/startup_page.dart' show Splash;
import 'package:commerce_mobile/design/design.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

const _blue = Color(0xFF415F91);
const _white = Color(0xFFFFFFFF);

/// The mark: a shopping bag with a tick in it — goods, and good ones.
class _MarkPainter extends CustomPainter {
  const _MarkPainter(this.color, {this.inset = 0.15});

  final Color color;

  /// Margin around the mark, as a share of the canvas.
  final double inset;

  @override
  void paint(Canvas canvas, Size size) {
    final side = size.shortestSide * (1 - inset * 2);
    canvas.translate((size.width - side) / 2, (size.height - side) / 2);
    canvas.scale(side / 24);
    final stroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.9
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    canvas.drawPath(
      parseGlyphPath(
        'M5.5 8h13l-.9 11.1a1 1 0 0 1-1 .9H7.4a1 1 0 0 1-1-.9zM9 10.5V7'
        'a3 3 0 0 1 6 0v3.5',
      ),
      stroke,
    );
    canvas.drawPath(
      parseGlyphPath('M9.4 15.3l1.8 1.8 3.5-3.7'),
      stroke..strokeWidth = 2.1,
    );
  }

  @override
  bool shouldRepaint(_MarkPainter old) => false;
}

Widget _icon({bool transparent = false, double inset = 0.15}) => ColoredBox(
  color: transparent ? const Color(0x00000000) : _blue,
  child: CustomPaint(painter: _MarkPainter(_white, inset: inset)),
);

// On the page colour, not transparent: iOS launch screens do not draw a
// transparent image (it comes out blank), and the storyboard background is the
// same colour, so the edge never shows.
Widget _wordmark(Palette palette) => Directionality(
  textDirection: TextDirection.ltr,
  child: ColoredBox(
    color: palette.paper,
    child: Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            AppBrand.name,
            style: TypeScale(
              palette.ink,
            ).display.copyWith(fontSize: 3 * Splash.title, height: 1.1),
          ),
          const SizedBox(height: 3 * Splash.gap),
          Text(
            'by ${AppBrand.maker}',
            style: TypeScale(
              palette.inkMuted,
            ).body.copyWith(fontSize: 3 * Splash.byline),
          ),
        ],
      ),
    ),
  ),
);

Future<void> _save(
  WidgetTester tester,
  Widget widget,
  Size size,
  String name,
) async {
  final key = GlobalKey();
  tester.view.physicalSize = size;
  tester.view.devicePixelRatio = 1;
  await tester.pumpWidget(
    RepaintBoundary(
      key: key,
      child: SizedBox.fromSize(size: size, child: widget),
    ),
  );
  await tester.runAsync(() async {
    final boundary =
        key.currentContext!.findRenderObject()! as RenderRepaintBoundary;
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final file = File('build/brand/$name.png')..createSync(recursive: true);
    file.writeAsBytesSync(bytes!.buffer.asUint8List());
  });
}

void main() {
  testWidgets('render brand assets', (tester) async {
    await tester.runAsync(() async {
      final font = FontLoader(
        TypeScale.family,
      )..addFont(rootBundle.load('assets/fonts/SchibstedGrotesk-Variable.ttf'));
      await font.load();
    });

    // iOS masks the corners itself; the square is full bleed.
    await _save(tester, _icon(), const Size(1024, 1024), 'icon');
    // Android adaptive icon: 108dp canvas, the mark inside the 66dp safe
    // zone, on a separate background colour.
    await _save(
      tester,
      _icon(transparent: true, inset: 0.24),
      const Size(432, 432),
      'adaptive_foreground',
    );
    // Splash wordmark, light and dark, drawn at 3x.
    for (final (palette, name) in [
      (Palette.light, 'splash_light'),
      (Palette.dark, 'splash_dark'),
    ]) {
      await _save(
        tester,
        _wordmark(palette),
        const Size(3 * Splash.width, 3 * Splash.height),
        name,
      );
    }
  });
}
