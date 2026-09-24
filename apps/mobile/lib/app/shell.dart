import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'services.dart';

class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final cart = context.services.cart;
    return Scaffold(
      body: shell,
      bottomNavigationBar: ListenableBuilder(
        listenable: cart,
        builder: (context, _) {
          final count = cart.itemCount;
          return NavigationBar(
            selectedIndex: shell.currentIndex,
            // Re-tapping the current tab returns to its first screen.
            onDestinationSelected: (index) =>
                shell.goBranch(index, initialLocation: index == shell.currentIndex),
            destinations: [
              const NavigationDestination(
                  icon: Icon(Icons.storefront_outlined),
                  selectedIcon: Icon(Icons.storefront),
                  label: 'Shop'),
              const NavigationDestination(
                  icon: Icon(Icons.search), label: 'Search'),
              NavigationDestination(
                icon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count > 99 ? '99+' : '$count'),
                  child: const Icon(Icons.shopping_cart_outlined),
                ),
                selectedIcon: Badge(
                  isLabelVisible: count > 0,
                  label: Text(count > 99 ? '99+' : '$count'),
                  child: const Icon(Icons.shopping_cart),
                ),
                label: 'Cart',
              ),
              const NavigationDestination(
                  icon: Icon(Icons.person_outline),
                  selectedIcon: Icon(Icons.person),
                  label: 'Account'),
            ],
          );
        },
      ),
    );
  }
}
