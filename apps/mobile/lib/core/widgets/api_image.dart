import 'package:flutter/material.dart';

import '../../app/services.dart';

/// A product image from the API.
///
/// Media URLs arrive origin-relative and signed (`/api/v1/media/...?
/// signature=...`), so they are resolved against the API origin in effect —
/// which is the tunnel's, not the page's, since there is no page.
class ApiImage extends StatelessWidget {
  const ApiImage(this.url, {super.key, this.fit = BoxFit.cover});

  final String? url;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final placeholder = ColoredBox(
      color: scheme.surfaceContainerHighest,
      child: Center(
        child: Icon(Icons.image_outlined, color: scheme.outline, size: 32),
      ),
    );

    final raw = url;
    if (raw == null || raw.isEmpty) return placeholder;
    final resolved = context.services.endpoint.origin.resolve(raw);

    return Image.network(
      resolved.toString(),
      fit: fit,
      errorBuilder: (_, _, _) => placeholder,
      loadingBuilder: (context, child, progress) =>
          progress == null ? child : placeholder,
    );
  }
}
