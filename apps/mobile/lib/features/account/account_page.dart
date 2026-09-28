import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../../app/services.dart';
import '../../design/design.dart';
import '../auth/sign_in_prompt.dart';
import '../updates/about_app.dart';

class AccountPage extends StatelessWidget {
  const AccountPage({super.key});

  Future<void> _signOut(BuildContext context) async {
    final ok = await confirm(
      context,
      title: 'Sign out?',
      message: 'Your cart and orders stay in your account for next time.',
      confirmLabel: 'Sign out',
    );
    if (ok && context.mounted) await context.services.session.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final services = context.services;
    final session = services.session;
    return ListenableBuilder(
      listenable: session,
      builder: (context, _) {
        const server = AboutAppGroup();

        if (!session.isSignedIn) {
          return PageScaffold(
            title: 'Account',
            slivers: [
              const SliverFillRemaining(
                hasScrollBody: false,
                child: SignInPrompt(
                  icon: Glyphs.person,
                  title: 'Your account',
                  message:
                      'Sign in to track orders, save addresses and keep a wishlist.',
                  from: '/account',
                ),
              ),
              SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
                sliver: SliverToBoxAdapter(child: server),
              ),
            ],
          );
        }

        final user = session.user!;
        final colors = context.colors;
        return PageScaffold(
          title: 'Account',
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.symmetric(horizontal: Space.gutter),
              sliver: SliverList.list(
                children: [
                  const SizedBox(height: Space.x2),
                  Row(
                    children: [
                      Container(
                        width: 52,
                        height: 52,
                        decoration: BoxDecoration(
                          color: colors.accentWash,
                          shape: BoxShape.circle,
                        ),
                        alignment: Alignment.center,
                        child: Text(
                          user.email.substring(0, 1).toUpperCase(),
                          style: context.type.heading.copyWith(
                            color: colors.accent,
                          ),
                        ),
                      ),
                      const SizedBox(width: Space.x4),
                      Expanded(
                        child: Text(
                          user.email,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: context.type.bodyStrong,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.x6),
                  InsetGroup(
                    children: [
                      ListRow(
                        leading: Glyphs.receipt,
                        title: 'Orders',
                        onPressed: () => context.push('/account/orders'),
                      ),
                      ListRow(
                        leading: Glyphs.heart,
                        title: 'Wishlist',
                        onPressed: () => context.push('/wishlist'),
                      ),
                      ListRow(
                        leading: Glyphs.pin,
                        title: 'Addresses',
                        onPressed: () => context.push('/account/addresses'),
                      ),
                      ListRow(
                        leading: Glyphs.idCard,
                        title: 'Profile',
                        onPressed: () => context.push('/account/profile'),
                      ),
                    ],
                  ),
                  const SizedBox(height: Space.x6),
                  server,
                  const SizedBox(height: Space.x6),
                  InsetGroup(
                    children: [
                      ListRow(
                        leading: Glyphs.signOut,
                        title: 'Sign out',
                        destructive: true,
                        showChevron: false,
                        onPressed: () => _signOut(context),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}
