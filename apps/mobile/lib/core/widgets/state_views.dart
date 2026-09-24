import 'package:flutter/material.dart';

import '../state/loader.dart';

class LoadingView extends StatelessWidget {
  const LoadingView({super.key});

  @override
  Widget build(BuildContext context) =>
      const Center(child: CircularProgressIndicator());
}

class ErrorView extends StatelessWidget {
  const ErrorView({
    super.key,
    required this.message,
    this.onRetry,
    this.requestId,
    this.action,
  });

  final String message;
  final VoidCallback? onRetry;

  /// Shown small, so a tester can quote it and the matching API log line is
  /// one search away.
  final String? requestId;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.cloud_off_outlined,
                size: 48, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(message,
                textAlign: TextAlign.center, style: theme.textTheme.bodyLarge),
            if (requestId != null) ...[
              const SizedBox(height: 8),
              SelectableText('Ref: $requestId',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall
                      ?.copyWith(color: theme.colorScheme.outline)),
            ],
            if (onRetry != null) ...[
              const SizedBox(height: 20),
              FilledButton.tonal(
                  onPressed: onRetry, child: const Text('Try again')),
            ],
            if (action != null) ...[const SizedBox(height: 8), action!],
          ],
        ),
      ),
    );
  }
}

class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.icon,
    required this.title,
    this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String? message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: theme.colorScheme.outline),
            const SizedBox(height: 16),
            Text(title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium),
            if (message != null) ...[
              const SizedBox(height: 8),
              Text(message!,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant)),
            ],
            if (action != null) ...[const SizedBox(height: 20), action!],
          ],
        ),
      ),
    );
  }
}

/// Renders a [Loader]: spinner the first time, the error with a retry if it
/// fails, and [builder] once there is data. A failed *refresh* keeps the data
/// on screen rather than replacing it with an error.
class LoaderView<T> extends StatelessWidget {
  const LoaderView({super.key, required this.loader, required this.builder});

  final Loader<T> loader;
  final Widget Function(BuildContext context, T data) builder;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: loader,
      builder: (context, _) {
        final data = loader.data;
        if (data != null) return builder(context, data);
        if (loader.error != null) {
          return ErrorView(
            message: loader.errorMessage!,
            requestId: loader.requestId,
            onRetry: loader.load,
          );
        }
        return const LoadingView();
      },
    );
  }
}

void showMessage(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
