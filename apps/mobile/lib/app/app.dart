import 'package:flutter/cupertino.dart' show DefaultCupertinoLocalizations;
import 'package:flutter/material.dart' show DefaultMaterialLocalizations;
import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

import '../design/design.dart';
import 'router.dart';
import 'services.dart';

class CommerceApp extends StatefulWidget {
  const CommerceApp({super.key, required this.services});

  final AppServices services;

  @override
  State<CommerceApp> createState() => _CommerceAppState();
}

class _CommerceAppState extends State<CommerceApp> {
  late final GoRouter _router = buildRouter(widget.services);
  final _toasts = GlobalKey<ToastHostState>();

  @override
  void initState() {
    super.initState();
    widget.services.session.addListener(_onSessionChanged);
  }

  @override
  void dispose() {
    widget.services.session.removeListener(_onSessionChanged);
    _router.dispose();
    super.dispose();
  }

  /// A session the server refused to renew ends without the user doing
  /// anything; say so, or it looks like the app forgot them — and get them
  /// off any account-only screen they were on.
  ///
  /// The router's own redirect cannot do the second part: on a refresh it
  /// evaluates the base location, not routes opened with `push`, and nearly
  /// every account screen is pushed.
  void _onSessionChanged() {
    if (!widget.services.session.takeExpiredNotice()) return;
    _toasts.currentState?.show(
      'Your session has ended. Sign in again to continue.',
    );

    final configuration = _router.routerDelegate.currentConfiguration;
    if (configuration.isEmpty) return;
    // `last` descends into the tab shell to the screen actually showing.
    final top = configuration.last.matchedLocation;
    if (isProtectedLocation(top)) {
      _router.go('/sign-in?from=${Uri.encodeComponent(top)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      // WidgetsApp, not MaterialApp: the visible UI is the design system's
      // own, and nothing Material should leak in by default.
      child: WidgetsApp.router(
        title: 'Commerce',
        color: Palette.light.accent,
        debugShowCheckedModeBanner: false,
        routerConfig: _router,
        // The platform text-selection menus borrowed by InputField need these.
        localizationsDelegates: const [
          DefaultWidgetsLocalizations.delegate,
          DefaultMaterialLocalizations.delegate,
          DefaultCupertinoLocalizations.delegate,
        ],
        builder: (context, child) {
          final dark =
              MediaQuery.platformBrightnessOf(context) == Brightness.dark;
          final theme = DesignTheme.of(dark ? Palette.dark : Palette.light);
          return DesignScope(
            theme: theme,
            child: DefaultTextStyle(
              style: theme.type.body,
              child: ScrollConfiguration(
                behavior: const _Scrolling(),
                child: ToastHost(key: _toasts, child: child!),
              ),
            ),
          );
        },
      ),
    );
  }
}

/// Bouncing overscroll on every platform — the design system's pull to
/// refresh is Cupertino's, which needs it — and no Material glow.
class _Scrolling extends ScrollBehavior {
  const _Scrolling();

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) =>
      const BouncingScrollPhysics(parent: AlwaysScrollableScrollPhysics());

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) => child;
}
