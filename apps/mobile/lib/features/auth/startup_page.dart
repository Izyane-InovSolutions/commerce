import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../design/design.dart';
import 'session_controller.dart';

/// Shown while a stored session is resumed, and if that cannot happen
/// because the server is unreachable. The router moves on by itself once the
/// session settles.
class StartupPage extends StatelessWidget {
  const StartupPage({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.services.session;
    final colors = context.colors;
    return ColoredBox(
      color: colors.paper,
      child: ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          if (session.status != SessionStatus.unreachable) {
            return Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Commerce', style: context.type.display),
                  const SizedBox(height: Space.x6),
                  const Spinner(),
                ],
              ),
            );
          }
          return ErrorState(
            message:
                session.restoreError?.message ?? "Couldn't reach the server.",
            requestId: session.restoreError?.requestId,
            onRetry: session.restore,
            // The internal-testing tunnel's hostname changes whenever it
            // restarts, so this is the likeliest fix — offer it right here.
            action: Padding(
              padding: const EdgeInsets.only(top: Space.x2),
              child: Button(
                label: 'Change server',
                variant: ButtonVariant.ghost,
                expand: false,
                onPressed: () => context.push('/settings/server'),
              ),
            ),
          );
        },
      ),
    );
  }
}
