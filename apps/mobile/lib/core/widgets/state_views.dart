import 'package:flutter/widgets.dart';

import '../../design/design.dart';
import '../state/loader.dart';

/// Renders a [Loader]: a placeholder the first time, the error with a retry
/// if it fails, and [builder] once there is data. A failed *refresh* keeps
/// the data on screen rather than replacing it with an error.
class LoaderView<T> extends StatelessWidget {
  const LoaderView({
    super.key,
    required this.loader,
    required this.builder,
    this.placeholder,
  });

  final Loader<T> loader;
  final Widget Function(BuildContext context, T data) builder;

  /// Shown on first load; a spinner when omitted. Prefer a skeleton in the
  /// shape of the content where the layout is known.
  final Widget? placeholder;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: loader,
      builder: (context, _) {
        final data = loader.data;
        if (data != null) return builder(context, data);
        if (loader.error != null) {
          return ErrorState(
            message: loader.errorMessage!,
            requestId: loader.requestId,
            onRetry: loader.load,
          );
        }
        return placeholder ?? const LoadingState();
      },
    );
  }
}

void showMessage(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) => context.toast(message, actionLabel: actionLabel, onAction: onAction);
