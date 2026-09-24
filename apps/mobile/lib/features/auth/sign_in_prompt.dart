import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/state_views.dart';

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

  final IconData icon;
  final String title;
  final String message;
  final String from;

  @override
  Widget build(BuildContext context) {
    final query = '?from=${Uri.encodeComponent(from)}';
    return EmptyView(
      icon: icon,
      title: title,
      message: message,
      action: Column(
        children: [
          FilledButton(
            onPressed: () => context.push('/sign-in$query'),
            child: const Text('Sign in'),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => context.push('/register$query'),
            child: const Text('Create an account'),
          ),
        ],
      ),
    );
  }
}
