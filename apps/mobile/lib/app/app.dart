import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import 'router.dart';

class CommerceApp extends StatelessWidget {
  const CommerceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'Commerce',
      theme: AppTheme.light(),
      routerConfig: appRouter,
    );
  }
}
