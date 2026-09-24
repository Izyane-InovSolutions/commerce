import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../auth/sign_in_prompt.dart';

class AccountPage extends StatelessWidget {
  const AccountPage({super.key});

  Future<void> _signOut(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed == true && context.mounted) {
      await context.services.session.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = context.services.session;
    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListenableBuilder(
        listenable: session,
        builder: (context, _) {
          final serverTile = ListTile(
            leading: const Icon(Icons.dns_outlined),
            title: const Text('Server settings'),
            subtitle: Text(context.services.endpoint.value.host),
            onTap: () => context.push('/settings/server'),
          );

          if (!session.isSignedIn) {
            return Column(children: [
              const Expanded(
                child: SignInPrompt(
                  icon: Icons.person_outline,
                  title: 'Your account',
                  message: 'Sign in to track orders, manage addresses and see saved items.',
                  from: '/account',
                ),
              ),
              SafeArea(top: false, child: serverTile),
            ]);
          }

          final theme = Theme.of(context);
          final user = session.user!;
          return ListView(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                child: Row(children: [
                  CircleAvatar(
                    radius: 28,
                    child: Text(user.email.substring(0, 1).toUpperCase(),
                        style: theme.textTheme.titleLarge),
                  ),
                  const SizedBox(width: 16),
                  Expanded(child: Text(user.email, style: theme.textTheme.titleMedium)),
                ]),
              ),
              _Tile(Icons.receipt_long_outlined, 'Orders', '/account/orders'),
              _Tile(Icons.favorite_border, 'Wishlist', '/wishlist'),
              _Tile(Icons.location_on_outlined, 'Addresses', '/account/addresses'),
              _Tile(Icons.badge_outlined, 'Profile', '/account/profile'),
              const Divider(),
              serverTile,
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Sign out'),
                onTap: () => _signOut(context),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile(this.icon, this.title, this.route);

  final IconData icon;
  final String title;
  final String route;

  @override
  Widget build(BuildContext context) => ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push(route),
      );
}
