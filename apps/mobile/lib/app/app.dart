import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/feature_flags.dart';
import '../core/notifications/local_notifier.dart';
import '../data/api/auth.dart';
import '../data/providers.dart';
import '../core/startup/deferred_init.dart';
import '../l10n/gen/app_localizations.dart';

import 'router.dart';
import '../core/theme/centurion_theme.dart';

class CenturionApp extends ConsumerStatefulWidget {
  const CenturionApp({super.key, this.initialLocation = '/'});
  final String initialLocation;

  @override
  ConsumerState<CenturionApp> createState() => _CenturionAppState();
}

class _CenturionAppState extends ConsumerState<CenturionApp> {
  late final GoRouter _router = _build();
  final _authTick = ValueNotifier<int>(0);
  StreamSubscription<AuthState>? _authSub;

  GoRouter _build() {
    if (!ref.read(featureFlagsProvider).authGateEnabled) return buildRouter(initialLocation: widget.initialLocation);
    final auth = ref.read(authControllerProvider);
    _authSub = auth.states.listen((_) => _authTick.value++);
    return buildRouter(
      initialLocation: widget.initialLocation,
      isSignedIn: () => auth.state is SignedIn,
      authChanges: _authTick,
    );
  }

  @override
  void initState() {
    super.initState();
    // Push / Realtime / Telegram / analytics: only after the first frame.
    ref.read(deferredInitProvider).scheduleAfterFirstFrame();
  }

  @override
  void dispose() {
    _authSub?.cancel();
    _authTick.dispose();
    _router.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      onGenerateTitle: (context) => AppLocalizations.of(context).appName,
      debugShowCheckedModeBanner: false,
      // Dark is the default per SPEC; light kept for OS-level switch later.
      themeMode: ThemeMode.dark,
      theme: CenturionTheme.light(),
      darkTheme: CenturionTheme.dark(),
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
