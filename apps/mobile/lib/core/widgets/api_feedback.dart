import 'package:flutter/material.dart';

import '../../data/api/api_exception.dart';
import '../../data/api/strategy_patch.dart';
import '../../l10n/gen/app_localizations.dart';
import '../error_l10n.g.dart';
import '../l10n_format.dart';
import '../theme/sentra_theme.dart';

/// Colors per i18n tone: pending = info (a status, never red), warning, error.
({Color fg, Color bg, IconData icon}) toneStyle(BuildContext context, ErrorTone tone) {
  final t = context.tradeColors;
  final cs = Theme.of(context).colorScheme;
  return switch (tone) {
    ErrorTone.pending => (fg: t.info, bg: t.infoContainer, icon: Icons.hourglass_top),
    ErrorTone.warning => (fg: t.warning, bg: t.warningContainer, icon: Icons.warning_amber),
    ErrorTone.error => (fg: cs.onErrorContainer, bg: cs.errorContainer, icon: Icons.error_outline),
  };
}

/// Localized, tone-aware snackbar for an [ApiException] (errors.map.json 0.4.6).
void showApiError(BuildContext context, ApiException e, {VoidCallback? onCta}) {
  final l = AppLocalizations.of(context);
  final tone = errorTone(e.code);
  final s = toneStyle(context, tone);
  final title = errorTitle(l, e.code);
  final cta = errorCta(l, e.code);
  ScaffoldMessenger.maybeOf(context)?.showSnackBar(
    SnackBar(
      key: Key('apiError_${tone.name}'),
      backgroundColor: s.bg,
      content: Row(
        children: [
          Icon(s.icon, color: s.fg, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Text([?title, errorText(l, e.code, e.details)].join('\n'), style: TextStyle(color: s.fg)),
          ),
        ],
      ),
      action: cta != null && onCta != null ? SnackBarAction(label: cta, textColor: s.fg, onPressed: onCta) : null,
    ),
  );
}

/// REST PATCH 202: the edit loosens a guard and is WAITING for approval (not applied).
void showGuardWeakenPending(BuildContext context, StrategyPatchPendingApproval p, {VoidCallback? onOpen}) {
  final l = AppLocalizations.of(context);
  final s = toneStyle(context, ErrorTone.pending);
  final loc = Localizations.localeOf(context).languageCode;
  ScaffoldMessenger.maybeOf(context)?.showSnackBar(
    SnackBar(
      key: const Key('guardWeakenPending'),
      backgroundColor: s.bg,
      duration: const Duration(seconds: 8),
      content: Text(
        '${l.guardWeakenPendingTitle}\n${l.guardWeakenPendingBody(formatTime(p.expiresAt.toLocal(), loc))}',
        style: TextStyle(color: s.fg),
      ),
      action: onOpen == null
          ? null
          : SnackBarAction(label: l.guardWeakenPendingOpen, textColor: s.fg, onPressed: onOpen),
    ),
  );
}
