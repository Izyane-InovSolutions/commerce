import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../design/design.dart';
import 'services.dart';

/// The tabbed frame. Content scrolls beneath the floating dock; each page
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
                bottom: BottomTabs.reserved(media.padding.bottom),
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
                const TabItem(icon: Glyphs.store, label: 'Shop'),
                const TabItem(icon: Glyphs.search, label: 'Search'),
                TabItem(icon: Glyphs.bag, label: 'Cart', badge: cart.itemCount),
                const TabItem(icon: Glyphs.tag, label: 'Selling'),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
