import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/notifications/local_notifier.dart';
import '../l10n/gen/app_localizations.dart';

import 'router.dart';
import '../core/theme/solbot_theme.dart';

class SolBotApp extends ConsumerStatefulWidget {
  const SolBotApp({super.key, this.initialLocation = '/'});
  final String initialLocation;

  @override
  ConsumerState<SolBotApp> createState() => _SolBotAppState();
}

class _SolBotAppState extends ConsumerState<SolBotApp> {
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
      // UX ARB (lib/l10n). One language for copy AND numbers (format.mjs rule).
      locale: Locale(ref.watch(notificationLocaleProvider).name),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: const [
        AppLocalizations.delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
    );
  }
}
