import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../core/theme/app_theme.dart';
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
  final _messenger = GlobalKey<ScaffoldMessengerState>();

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
    _messenger.currentState?.showSnackBar(const SnackBar(
        content: Text('Your session has ended. Please sign in again.')));

    final matches = _router.routerDelegate.currentConfiguration.matches;
    if (matches.isEmpty) return;
    final top = matches.last.matchedLocation;
    if (isProtectedLocation(top)) {
      _router.go('/sign-in?from=${Uri.encodeComponent(top)}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return AppScope(
      services: widget.services,
      child: MaterialApp.router(
        title: 'Commerce',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        scaffoldMessengerKey: _messenger,
        routerConfig: _router,
      ),
    );
  }
}
