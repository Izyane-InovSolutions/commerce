import 'dart:math' as math;

import 'package:flutter/widgets.dart';

import 'theme.dart';

/// A rotating arc. Under reduce-motion it holds still rather than spinning.
class Spinner extends StatefulWidget {
  const Spinner({super.key, this.size = 22, this.color, this.stroke = 2.4});

  final double size;
  final Color? color;
  final double stroke;

  @override
  State<Spinner> createState() => _SpinnerState();
}

class _SpinnerState extends State<Spinner> with SingleTickerProviderStateMixin {
  late final AnimationController _turns = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _turns.stop();
    } else if (!_turns.isAnimating) {
      _turns.repeat();
    }
  }

  @override
  void dispose() {
    _turns.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? context.colors.accent;
    return Semantics(
      label: 'Loading',
      child: SizedBox.square(
        dimension: widget.size,
        child: RotationTransition(
          turns: _turns,
          child: CustomPaint(painter: _ArcPainter(color, widget.stroke)),
        ),
      ),
    );
  }
}

class _ArcPainter extends CustomPainter {
  const _ArcPainter(this.color, this.stroke);

  final Color color;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final track = Paint()
      ..color = color.withValues(alpha: 0.18)
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke;
    final arc = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final inset = rect.deflate(stroke / 2);
    canvas.drawArc(inset, 0, math.pi * 2, false, track);
    canvas.drawArc(inset, -math.pi / 2, math.pi * 0.7, false, arc);
  }

  @override
  bool shouldRepaint(_ArcPainter old) =>
      old.color != color || old.stroke != stroke;
}
