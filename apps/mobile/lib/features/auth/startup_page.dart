import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/brand.dart';
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
            return Stack(
              children: [
                const Center(child: SplashWordmark()),
                // Below the wordmark, so the wordmark stays exactly where
                // the native splash drew it and the hand-over does not jump.
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: MediaQuery.paddingOf(context).bottom + Space.x10,
                  child: const Center(child: Spinner()),
                ),
              ],
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

/// The splash wordmark's measurements, in logical pixels. The native launch
/// screens show an image rendered from the same numbers
/// (`tool/render_brand_test.dart`), so the native splash and this one line
/// up exactly.
class Splash {
  const Splash._();

  static const width = 360.0;
  static const height = 120.0;
  static const title = 34.0;
  static const byline = 15.0;
  static const gap = 6.0;
}

/// "Good for Goods, by iZyane" — the first thing on every launch.
class SplashWordmark extends StatelessWidget {
  const SplashWordmark({super.key});

  @override
  Widget build(BuildContext context) {
    final type = context.type;
    return Semantics(
      label: '${AppBrand.name}, by ${AppBrand.maker}',
      excludeSemantics: true,
      child: SizedBox(
        width: Splash.width,
        height: Splash.height,
        // The launch image does not scale with text size; neither does this,
        // or the hand-over from the native splash would jump.
        child: MediaQuery.withNoTextScaling(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(
                AppBrand.name,
                style: type.display.copyWith(
                  fontSize: Splash.title,
                  height: 1.1,
                ),
              ),
              const SizedBox(height: Splash.gap),
              Text(
                'by ${AppBrand.maker}',
                style: type.body.copyWith(
                  fontSize: Splash.byline,
                  color: context.colors.inkMuted,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
