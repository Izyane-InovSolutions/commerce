import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';

import 'button.dart';
import 'spinner.dart';
import 'theme.dart';
import 'tokens.dart';

class LoadingState extends StatelessWidget {
  const LoadingState({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: Spinner(size: 28));
}

/// When something failed. Says what happened and offers the next step; the
/// reference lets a tester quote the exact failure to whoever reads the API
/// logs.
class ErrorState extends StatelessWidget {
  const ErrorState({
    super.key,
    required this.message,
    this.onRetry,
    this.requestId,
    this.action,
  });

  final String message;
  final VoidCallback? onRetry;
  final String? requestId;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return _Centered(
      icon: Icons.wifi_off_rounded,
      iconColor: colors.inkMuted,
      title: message,
      footer: [
        if (onRetry != null)
          Button(
            label: 'Try again',
            variant: ButtonVariant.secondary,
            expand: false,
            onPressed: onRetry,
          ),
        ?action,
        if (requestId != null)
          Padding(
            padding: const EdgeInsets.only(top: Space.x4),
            child: Text(
              'Reference $requestId',
              textAlign: TextAlign.center,
              style: context.type.caption.copyWith(color: colors.inkSubtle),
            ),
          ),
      ],
    );
  }
}

/// When there is nothing yet — which is an invitation to act, so it usually
/// carries one.
class EmptyState extends StatelessWidget {
  const EmptyState({
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
  Widget build(BuildContext context) => _Centered(
    icon: icon,
    iconColor: context.colors.accent,
    title: title,
    message: message,
    footer: [?action],
  );
}

class _Centered extends StatelessWidget {
  const _Centered({
    required this.icon,
    required this.iconColor,
    required this.title,
    this.message,
    this.footer = const [],
  });

  final IconData icon;
  final Color iconColor;
  final String title;
  final String? message;
  final List<Widget> footer;

  @override
  Widget build(BuildContext context) {
    final colors = context.colors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: Space.x10,
          vertical: Space.x8,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: colors.tile,
                borderRadius: const BorderRadius.all(Radii.tile),
              ),
              child: Icon(icon, size: 30, color: iconColor),
            ),
            const SizedBox(height: Space.x5),
            Text(
              title,
              textAlign: TextAlign.center,
              style: context.type.heading,
            ),
            if (message != null) ...[
              const SizedBox(height: Space.x2),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: context.type.body.copyWith(color: colors.inkMuted),
              ),
            ],
            if (footer.isNotEmpty) ...[
              const SizedBox(height: Space.x6),
              ...footer,
            ],
          ],
        ),
      ),
    );
  }
}
