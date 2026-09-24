import 'package:flutter/material.dart' show Icons;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../design/design.dart';
import 'services.dart';

/// The tabbed frame. Content scrolls beneath the frosted tab bar; each page
/// learns how much room the bar takes through MediaQuery's bottom padding.
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final cart = context.services.cart;
    final media = MediaQuery.of(context);
    return Stack(
      children: [
        Positioned.fill(
          child: MediaQuery(
            data: media.copyWith(
              padding: media.padding.copyWith(
                bottom: media.padding.bottom + BottomTabs.height,
              ),
            ),
            child: shell,
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: ListenableBuilder(
            listenable: cart,
            builder: (context, _) => BottomTabs(
              index: shell.currentIndex,
              // Re-selecting the current tab returns to its first screen.
              onSelect: (index) => shell.goBranch(
                index,
                initialLocation: index == shell.currentIndex,
              ),
              items: [
                const TabItem(
                  icon: Icons.storefront_outlined,
                  activeIcon: Icons.storefront_rounded,
                  label: 'Shop',
                ),
                const TabItem(
                  icon: Icons.search_rounded,
                  activeIcon: Icons.search_rounded,
                  label: 'Search',
                ),
                TabItem(
                  icon: Icons.shopping_bag_outlined,
                  activeIcon: Icons.shopping_bag_rounded,
                  label: 'Cart',
                  badge: cart.itemCount,
                ),
                const TabItem(
                  icon: Icons.person_outline_rounded,
                  activeIcon: Icons.person_rounded,
                  label: 'Account',
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
