import 'package:flutter/widgets.dart';

import 'theme.dart';

/// One glyph of the Commerce set: outline strokes on a 24-unit grid, plus an
/// optional solid shape drawn beneath them when the glyph is *active* — the
/// selected tab, a saved item.
///
/// Written as SVG path data so a glyph is one readable line, parsed once and
/// cached. The set exists so that nothing on screen is borrowed iconography:
/// Material's icon font is what made the app read as an Android app.
@immutable
class GlyphData {
  const GlyphData(this.strokes, {this.fill});

  /// Outline path data, stroked with round caps and joins.
  final String strokes;

  /// Solid shape for the active state; when null, active looks like rest.
  final String? fill;
}

/// The Commerce glyph set.
///
/// Drawing rules, so a new glyph belongs: a 24-unit grid with a 2-unit
/// margin, one stroke weight (1.8 at 24pt, scaling with size), round ends
/// and joins, geometry over detail. Filled variants fill the glyph's main
/// shape and keep its strokes, so active and rest are the same silhouette.
class Glyphs {
  const Glyphs._();

  // Navigation
  static const back = GlyphData('M15 5l-7 7 7 7');
  static const forward = GlyphData('M9 5l7 7-7 7');
  static const close = GlyphData('M6 6l12 12M18 6L6 18');
  static const check = GlyphData('M5 12.5l4.5 4.5L19 7.5');
  static const add = GlyphData('M12 5v14M5 12h14');
  static const remove = GlyphData('M5 12h14');

  // Tabs
  static const store = GlyphData(
    'M4 9l1.5-5h13L20 9M4 9a2.67 2.67 0 0 0 5.33 0a2.67 2.67 0 0 0 5.34 0'
    'a2.67 2.67 0 0 0 5.33 0M5.5 11.5V20h13v-8.5M10 20v-4.5h4V20',
    fill:
        'M5.5 4h13L20 9a2.67 2.67 0 0 1-5.33 0a2.67 2.67 0 0 1-5.34 0'
        'a2.67 2.67 0 0 1-5.33 0z',
  );
  static const search = GlyphData(
    'M17 10.5a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0zM15.5 15.5L20 20',
  );
  static const bag = GlyphData(
    'M5.5 8h13l-.9 11.1a1 1 0 0 1-1 .9H7.4a1 1 0 0 1-1-.9zM9 10.5V7'
    'a3 3 0 0 1 6 0v3.5',
    fill: 'M5.5 8h13l-.9 11.1a1 1 0 0 1-1 .9H7.4a1 1 0 0 1-1-.9z',
  );
  static const person = GlyphData(
    'M15.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0zM5 20a7 7 0 0 1 14 0',
    fill: 'M15.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0zM5 20a7 7 0 0 1 14 0z',
  );

  static const tag = GlyphData(
    'M3.5 12.1V4.5a1 1 0 0 1 1-1h7.6l8.4 8.4a1.4 1.4 0 0 1 0 2l-6.6 6.6'
    'a1.4 1.4 0 0 1-2 0zM9.5 8a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0z',
    fill:
        'M3.5 12.1V4.5a1 1 0 0 1 1-1h7.6l8.4 8.4a1.4 1.4 0 0 1 0 2l-6.6 6.6'
        'a1.4 1.4 0 0 1-2 0z',
  );

  // Commerce
  static const bagAdd = GlyphData(
    'M5.5 8h13l-.9 11.1a1 1 0 0 1-1 .9H7.4a1 1 0 0 1-1-.9zM9 10.5V7'
    'a3 3 0 0 1 6 0v3.5M12 12.5v5M9.5 15h5',
  );
  static const heart = GlyphData(
    'M12 20C12 20 4.5 15.4 4.5 9.9A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.5 2.5'
    'C19.5 15.4 12 20 12 20z',
    fill:
        'M12 20C12 20 4.5 15.4 4.5 9.9A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 '
        '7.5 2.5C19.5 15.4 12 20 12 20z',
  );
  static const star = GlyphData(
    '',
    fill:
        'M12 3.4L14.41 9.28 20.75 9.76 15.9 13.87 17.41 20.04 12 16.7 '
        '6.59 20.04 8.1 13.87 3.25 9.76 9.59 9.28z',
  );
  static const receipt = GlyphData(
    'M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3zM9 8h6M9 11.5h6'
    'M9 15h3',
  );
  static const truck = GlyphData(
    'M14 16.5H3V6.5h11v10M14 10h3.5l3.5 3.5v3h-1.2M9.2 16.5h5.6M8.8 17'
    'a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0zM18.8 17a1.8 1.8 0 1 1-3.6 0'
    'a1.8 1.8 0 1 1 3.6 0z',
  );
  static const returnItem = GlyphData(
    'M9 14L4.5 9.5 9 5M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3',
  );
  static const card = GlyphData(
    'M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 '
    '0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5zM3 9.5h18M6.5 15h4',
  );
  static const lock = GlyphData(
    'M7 11h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z'
    'M8.5 11V8a3.5 3.5 0 0 1 7 0v3M12 14.5v2',
  );
  static const verified = GlyphData(
    'M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0zM8.5 12.2l2.4 2.4 '
    '4.6-4.8',
  );
  static const phone = GlyphData(
    'M8 3h8a1.5 1.5 0 0 1 1.5 1.5v15A1.5 1.5 0 0 1 16 21H8a1.5 1.5 0 0 1'
    '-1.5-1.5v-15A1.5 1.5 0 0 1 8 3zM11 18h2',
  );

  // Places
  static const pin = GlyphData(
    'M12 21C12 21 5.5 15.4 5.5 10a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z'
    'M14.3 10a2.3 2.3 0 1 1-4.6 0a2.3 2.3 0 1 1 4.6 0z',
  );
  static const pinAdd = GlyphData(
    'M12 21C12 21 5.5 15.4 5.5 10a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z'
    'M12 7.5v5M9.5 10h5',
  );
  static const pinOff = GlyphData(
    'M12 21C12 21 5.5 15.4 5.5 10a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z'
    'M4 4l16 16',
  );
  static const home = GlyphData(
    'M4 10.5L12 4l8 6.5V20H4zM10 20v-5h4v5',
    fill: 'M4 10.5L12 4l8 6.5V20H4z',
  );

  // Status
  static const alert = GlyphData(
    'M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0zM12 7.5V13M12 16.4v.1',
  );
  static const checkCircle = GlyphData(
    'M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0zM8.5 12.2l2.4 2.4 '
    '4.6-4.8',
  );
  static const closeCircle = GlyphData(
    'M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0zM9.2 9.2l5.6 5.6'
    'M14.8 9.2l-5.6 5.6',
  );
  static const clock = GlyphData(
    'M20.5 12a8.5 8.5 0 1 1-17 0a8.5 8.5 0 1 1 17 0zM12 7.5V12l3 2',
  );
  static const hourglass = GlyphData(
    'M6.5 3.5h11M6.5 20.5h11M8 3.5h8L12 12zM12 12l4 8.5H8z',
  );
  static const offline = GlyphData(
    'M5 10.5a10 10 0 0 1 14 0M8 13.5a5.7 5.7 0 0 1 8 0M12 17v.1M4 4l16 16',
  );
  static const searchOff = GlyphData(
    'M17 10.5a6.5 6.5 0 1 1-13 0a6.5 6.5 0 1 1 13 0zM15.5 15.5L20 20'
    'M8.7 8.7l3.6 3.6M12.3 8.7l-3.6 3.6',
  );
  static const image = GlyphData(
    'M5 5h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z'
    'M4 16l5-5 4 4 2.5-2.5L20 17M17 9a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0z',
  );

  // Actions
  static const edit = GlyphData('M14.5 5.5l4 4L9 19H5v-4zM12.5 7.5l4 4');
  static const trash = GlyphData(
    'M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l.9 13h9.2l.9-13M10 10.5V16'
    'M14 10.5V16',
  );
  static const filters = GlyphData(
    'M4 7h9M17 7h3M4 17h3M11 17h9M17 7a2 2 0 1 1-4 0a2 2 0 1 1 4 0z'
    'M11 17a2 2 0 1 1-4 0a2 2 0 1 1 4 0z',
  );
  static const sort = GlyphData(
    'M8 4v16M4.5 7.5L8 4l3.5 3.5M16 20V4M12.5 16.5L16 20l3.5-3.5',
  );
  static const download = GlyphData(
    'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
  );
  static const signOut = GlyphData(
    'M14 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H14M10 12h10'
    'M16.5 8.5L20 12l-3.5 3.5',
  );
  static const eye = GlyphData(
    'M2.5 12C4.5 8 8 5.5 12 5.5S19.5 8 21.5 12C19.5 16 16 18.5 12 18.5'
    'S4.5 16 2.5 12zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z',
  );
  static const eyeOff = GlyphData(
    'M2.5 12C4.5 8 8 5.5 12 5.5S19.5 8 21.5 12C19.5 16 16 18.5 12 18.5'
    'S4.5 16 2.5 12zM15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0zM4 4l16 16',
  );
  static const idCard = GlyphData(
    'M4.5 5.5h15A1.5 1.5 0 0 1 21 7v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 '
    '0 1 3 17V7a1.5 1.5 0 0 1 1.5-1.5zM10.5 10.5a2 2 0 1 1-4 0a2 2 0 1 1 4 0z'
    'M6 15.5a2.5 2.5 0 0 1 5 0M13.5 10h4M13.5 13.5h3',
  );
  static const server = GlyphData(
    'M5 4.5h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 '
    '1-1zM5 13.5h14a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4a1 1 0 '
    '0 1 1-1zM7.5 7.5h.01M7.5 16.5h.01',
  );

  /// Every glyph, for the glyph sheet test.
  static const all = <String, GlyphData>{
    'back': back,
    'forward': forward,
    'close': close,
    'check': check,
    'add': add,
    'remove': remove,
    'store': store,
    'search': search,
    'bag': bag,
    'person': person,
    'tag': tag,
    'bagAdd': bagAdd,
    'heart': heart,
    'star': star,
    'receipt': receipt,
    'truck': truck,
    'returnItem': returnItem,
    'card': card,
    'lock': lock,
    'verified': verified,
    'phone': phone,
    'pin': pin,
    'pinAdd': pinAdd,
    'pinOff': pinOff,
    'home': home,
    'alert': alert,
    'checkCircle': checkCircle,
    'closeCircle': closeCircle,
    'clock': clock,
    'hourglass': hourglass,
    'offline': offline,
    'searchOff': searchOff,
    'image': image,
    'edit': edit,
    'trash': trash,
    'filters': filters,
    'sort': sort,
    'download': download,
    'signOut': signOut,
    'eye': eye,
    'eyeOff': eyeOff,
    'idCard': idCard,
    'server': server,
  };
}

/// Draws a [GlyphData]. Decorative: whatever it sits in carries the label.
class Glyph extends StatelessWidget {
  const Glyph(
    this.data, {
    super.key,
    this.size = 24,
    this.color,
    this.fillColor,
    this.active = false,
  });

  final GlyphData data;
  final double size;
  final Color? color;

  /// The active fill; defaults to [color].
  final Color? fillColor;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final color = this.color ?? DefaultTextStyle.of(context).style.color;
    final ink = color ?? context.colors.ink;
    return ExcludeSemantics(
      child: SizedBox.square(
        dimension: size,
        child: CustomPaint(
          painter: _GlyphPainter(
            data,
            ink,
            active && data.fill != null ? (fillColor ?? ink) : null,
          ),
        ),
      ),
    );
  }
}

class _GlyphPainter extends CustomPainter {
  const _GlyphPainter(this.data, this.color, this.fill);

  final GlyphData data;
  final Color color;
  final Color? fill;

  static const _weight = 1.8;

  @override
  void paint(Canvas canvas, Size size) {
    canvas.save();
    canvas.scale(size.width / 24, size.height / 24);
    if (fill != null) {
      canvas.drawPath(
        parseGlyphPath(data.fill!),
        Paint()
          ..color = fill!
          ..style = PaintingStyle.fill
          ..isAntiAlias = true,
      );
    }
    if (data.strokes.isNotEmpty) {
      canvas.drawPath(
        parseGlyphPath(data.strokes),
        Paint()
          ..color = color
          ..style = PaintingStyle.stroke
          ..strokeWidth = _weight
          ..strokeCap = StrokeCap.round
          ..strokeJoin = StrokeJoin.round
          ..isAntiAlias = true,
      );
    } else if (fill == null && data.fill != null) {
      // A fill-only glyph (the rating star) is always drawn solid.
      canvas.drawPath(parseGlyphPath(data.fill!), Paint()..color = color);
    }
    canvas.restore();
  }

  @override
  bool shouldRepaint(_GlyphPainter old) =>
      old.data != data || old.color != color || old.fill != fill;
}

final _cache = <String, Path>{};

/// Parses SVG path data — the M L H V C S Q A Z commands, absolute and
/// relative, with implicit repeats — into a [Path]. Cached per string.
Path parseGlyphPath(String data) =>
    _cache.putIfAbsent(data, () => _PathParser(data).parse());

class _PathParser {
  _PathParser(this._src);

  final String _src;
  int _i = 0;

  static final _number = RegExp(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?');

  void _skip() {
    while (_i < _src.length && (_src[_i] == ' ' || _src[_i] == ',')) {
      _i++;
    }
  }

  bool get _atNumber {
    _skip();
    if (_i >= _src.length) return false;
    final c = _src.codeUnitAt(_i);
    return (c >= 48 && c <= 57) || c == 45 || c == 46; // digit, '-', '.'
  }

  double _num() {
    _skip();
    final match = _number.matchAsPrefix(_src, _i);
    if (match == null) {
      throw FormatException('Bad glyph path number', _src, _i);
    }
    _i = match.end;
    return double.parse(match[0]!);
  }

  /// Arc flags may be written without separators: `0 1 1-13 0` or `011`.
  bool _flag() {
    _skip();
    final c = _src[_i++];
    if (c != '0' && c != '1') {
      throw FormatException('Bad glyph arc flag', _src, _i - 1);
    }
    return c == '1';
  }

  Path parse() {
    final path = Path();
    var x = 0.0, y = 0.0, startX = 0.0, startY = 0.0;
    // The previous cubic's second control point, for S.
    double? lastCx, lastCy;
    String? command;

    while (true) {
      _skip();
      if (_i >= _src.length) break;
      final c = _src[_i];
      if (RegExp(r'[A-Za-z]').hasMatch(c)) {
        command = c;
        _i++;
      } else if (command == null) {
        throw FormatException('Glyph path must start with a command', _src);
      }
      final cmd = command;
      final rel = cmd == cmd.toLowerCase();
      final ox = rel ? x : 0.0, oy = rel ? y : 0.0;
      var cubic = false;

      switch (cmd.toUpperCase()) {
        case 'M':
          x = ox + _num();
          y = oy + _num();
          path.moveTo(x, y);
          startX = x;
          startY = y;
          // Pairs after a move are implicit line-tos.
          command = rel ? 'l' : 'L';
        case 'L':
          x = ox + _num();
          y = oy + _num();
          path.lineTo(x, y);
        case 'H':
          x = ox + _num();
          path.lineTo(x, y);
        case 'V':
          y = (rel ? y : 0.0) + _num();
          path.lineTo(x, y);
        case 'C':
          final x1 = ox + _num(), y1 = oy + _num();
          final x2 = ox + _num(), y2 = oy + _num();
          x = ox + _num();
          y = oy + _num();
          path.cubicTo(x1, y1, x2, y2, x, y);
          lastCx = x2;
          lastCy = y2;
          cubic = true;
        case 'S':
          final x1 = lastCx == null ? x : 2 * x - lastCx;
          final y1 = lastCy == null ? y : 2 * y - lastCy;
          final x2 = ox + _num(), y2 = oy + _num();
          x = ox + _num();
          y = oy + _num();
          path.cubicTo(x1, y1, x2, y2, x, y);
          lastCx = x2;
          lastCy = y2;
          cubic = true;
        case 'Q':
          final x1 = ox + _num(), y1 = oy + _num();
          x = ox + _num();
          y = oy + _num();
          path.quadraticBezierTo(x1, y1, x, y);
        case 'A':
          final rx = _num(), ry = _num(), rotation = _num();
          final large = _flag(), sweep = _flag();
          x = ox + _num();
          y = oy + _num();
          path.arcToPoint(
            Offset(x, y),
            radius: Radius.elliptical(rx, ry),
            rotation: rotation, // degrees, as in SVG
            largeArc: large,
            // SVG's positive sweep is clockwise on a y-down canvas.
            clockwise: sweep,
          );
        case 'Z':
          path.close();
          x = startX;
          y = startY;
        default:
          throw FormatException('Unsupported glyph command $cmd', _src);
      }
      if (!cubic) {
        lastCx = null;
        lastCy = null;
      }
      if (cmd.toUpperCase() == 'Z') {
        command = null;
      } else if (!_atNumber) {
        command = null;
      }
    }
    return path;
  }
}
