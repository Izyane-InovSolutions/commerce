import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';

import '../../app/services.dart';
import '../../design/design.dart';

/// A product image from the API, on the design system's image tile.
///
/// Media URLs arrive origin-relative and signed (`/api/v1/media/...?
/// signature=...`), so they are resolved against the API origin in effect —
/// the tunnel's, since a mobile app has no page origin of its own.
class ApiImage extends StatelessWidget {
  const ApiImage(
    this.url, {
    super.key,
    this.fit = BoxFit.cover,
    this.semanticLabel,
  });

  final String? url;
  final BoxFit fit;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    final placeholder = ColoredBox(
      color: colors.tile,
      child: Center(
        child: Icon(Icons.image_outlined, color: colors.inkSubtle, size: 28),
      ),
    );

    final raw = url;
    if (raw == null || raw.isEmpty) return placeholder;
    final resolved = context.services.endpoint.origin.resolve(raw);

    return ColoredBox(
      color: colors.tile,
      child: Image.network(
        resolved.toString(),
        fit: fit,
        semanticLabel: semanticLabel,
        excludeFromSemantics: semanticLabel == null,
        errorBuilder: (_, _, _) => placeholder,
        // Fade in rather than pop, once decoded.
        frameBuilder: (context, child, frame, synchronous) => synchronous
            ? child
            : AnimatedOpacity(
                opacity: frame == null ? 0 : 1,
                duration: Motion.base,
                child: child,
              ),
      ),
    );
  }
}
