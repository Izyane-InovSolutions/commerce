import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../design/design.dart';

/// What a tab that needs an account shows to someone signed out — instead of
/// yanking them to a sign-in form just for tapping the tab.
class SignInPrompt extends StatelessWidget {
  const SignInPrompt({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    required this.from,
  });

  final GlyphData icon;
  final String title;
  final String message;
  final String from;

  @override
  Widget build(BuildContext context) {
    final query = '?from=${Uri.encodeComponent(from)}';
    return EmptyState(
      icon: icon,
      title: title,
      message: message,
      action: Column(
        children: [
          Button(
            label: 'Sign in',
            onPressed: () => context.push('/sign-in$query'),
          ),
          const SizedBox(height: Space.x2),
          Button(
            label: 'Create an account',
            variant: ButtonVariant.ghost,
            onPressed: () => context.push('/register$query'),
          ),
        ],
      ),
    );
  }
}
