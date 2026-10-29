import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'router.dart';
import '../core/theme/solbot_theme.dart';

class SolBotApp extends StatefulWidget {
  const SolBotApp({super.key, this.initialLocation = '/'});
  final String initialLocation;

  @override
  State<SolBotApp> createState() => _SolBotAppState();
}

class _SolBotAppState extends State<SolBotApp> {
  late final GoRouter _router = buildRouter(initialLocation: widget.initialLocation);

  @override
  void dispose() {
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'SolBot',
      debugShowCheckedModeBanner: false,
      // Dark is the default per SPEC; light kept for OS-level switch later.
      themeMode: ThemeMode.dark,
      theme: SolbotTheme.light(),
      darkTheme: SolbotTheme.dark(),
      routerConfig: _router,
    );
  }
}
