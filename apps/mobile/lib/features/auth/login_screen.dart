import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/auth/phantom_deeplink.dart';
import '../../core/error_l10n.g.dart';
import '../../data/api/api_exception.dart';
import '../../data/api/auth.dart';
import '../../data/providers.dart';
import '../../l10n/gen/app_localizations.dart';
import 'login_strings.dart';

/// Wallet-only login (contracts 1.1.4): one button, Phantom deeplink. No email OTP,
/// no Telegram (stub behind its OFF flag, not shown).
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _busy = false;
  String? _error;

  String _message(Object e, AppLocalizations l, LoginStrings s) => switch (e) {
    WalletSignatureDeclined() => l.loginWalletRejected,
    ApiException() => errorText(l, e.code, e.details),
    PhantomLoginException(reason: 'not_installed') => s.phantomNotInstalled,
    PhantomLoginException(reason: 'expired') => s.phantomExpired,
    PhantomLoginException() || SiwsPayloadRejected() => s.phantomBadResponse,
    _ => errorText(l, ApiErrorCode.unknown),
  };

  Future<void> _signIn() async {
    final l = AppLocalizations.of(context);
    final s = LoginStrings.of(l.localeName);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider).signIn();
      if (mounted) context.go('/');
    } on Object catch (e) {
      if (mounted) setState(() => _error = _message(e, l, s));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final s = LoginStrings.of(l.localeName);
    final theme = Theme.of(context);
    final forced = ref.watch(authStateProvider).valueOrNull;
    final banner = _error ?? (forced is ForcedLogout ? l.errorCodeUnauthenticated : null);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Text(l.appName, style: theme.textTheme.headlineMedium, textAlign: TextAlign.center),
              const SizedBox(height: 8),
              Text(l.loginPracticeDefault, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
              const Spacer(),
              if (banner != null) ...[
                Container(
                  key: const Key('loginError'),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.errorContainer,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(banner, style: TextStyle(color: theme.colorScheme.onErrorContainer)),
                ),
                const SizedBox(height: 16),
              ],
              FilledButton.icon(
                key: const Key('loginPhantom'),
                onPressed: _busy ? null : _signIn,
                icon: _busy
                    ? const SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.account_balance_wallet_outlined),
                label: Text(_busy ? s.phantomWaiting : s.buttonPhantom),
              ),
              const SizedBox(height: 12),
              Text(l.loginWalletSignNote, style: theme.textTheme.bodySmall, textAlign: TextAlign.center),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
