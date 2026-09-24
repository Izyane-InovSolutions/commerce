import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../core/widgets/state_views.dart';
import 'session_controller.dart';

/// Shown while a stored session is being resumed, and if that cannot happen
/// because the server is unreachable. The router moves on by itself once the
/// session settles.
class StartupPage extends StatelessWidget {
  const StartupPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.services.session;
    return Scaffold(
      body: ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          if (session.status != SessionStatus.unreachable) {
            return const LoadingView();
          }
          return ErrorView(
            message: session.restoreError?.message ??
                "Couldn't reach the server.",
            requestId: session.restoreError?.requestId,
            onRetry: session.restore,
            // The internal-testing tunnel's hostname changes whenever it
            // restarts, so this is the likeliest fix — offer it right here.
            action: TextButton.icon(
              icon: const Icon(Icons.dns_outlined),
              label: const Text('Server settings'),
              onPressed: () => context.push('/settings/server'),
            ),
          );
        },
      ),
    );
  }
}
