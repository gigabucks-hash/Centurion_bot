import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/format.dart';
import '../../data/api/server_clock.dart';
import '../../core/notifications/local_notifier.dart';
import '../../core/notifications/notification_catalog.dart';
import '../../core/notifications/notification_renderer.dart';
import '../../core/push/push_payload.dart';
import '../../core/theme/sentra_theme.dart';
import '../../core/widgets/common.dart';

final _previewModeProvider = StateProvider<NotifMode>((_) => NotifMode.practice);

/// Lainnya → Notifikasi: language switch, mock notification shade (live
/// pushes from the mock backend) and the full 17-event catalog preview.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final locale = ref.watch(notificationLocaleProvider);
    final previewMode = ref.watch(_previewModeProvider);
    final shade = ref.watch(localNotifierProvider);
    final renderer = ref.watch(notificationRendererProvider);
    final now = DateTime.now();
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Notifikasi')),
      body: ListView(
        padding: const EdgeInsets.all(AppSpace.s4),
        children: [
          Row(
            children: [
              Expanded(child: Text('Bahasa (app + notifikasi)', style: tt.titleSmall)),
              SegmentedButton<NotifLocale>(
                key: const Key('notifLocale'),
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: NotifLocale.id, label: Text('ID')),
                  ButtonSegment(value: NotifLocale.en, label: Text('EN')),
                ],
                selected: {locale},
                onSelectionChanged: (s) => ref.read(notificationLocaleProvider.notifier).state = s.first,
              ),
            ],
          ),
          const SizedBox(height: AppSpace.s2),
          Text(
            'Approve dari notifikasi hanya untuk pick Practice dengan token valid. '
            'Real SOL: tanpa Approve/Skip, tap membuka kartu + biometrik. Sell tidak pernah dari notifikasi.',
            style: tt.bodySmall!.copyWith(color: Theme.of(context).colorScheme.onSurfaceVariant),
          ),
          SectionHeader('Diterima (mock push) · ${shade.length}'),
          if (shade.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: AppSpace.s3),
              child: Text('Belum ada. Pick baru, fill, TP, dan stop dari mock backend muncul di sini.'),
            )
          else
            for (final s in shade)
              NotificationTile(
                rendered: renderer.render(
                  s.message,
                  locale,
                  now,
                  groupCount: s.groupCount,
                  clockSkew: ref.watch(serverClockProvider),
                ),
                locale: locale,
                time: s.receivedAt,
                onAction: (a) async {
                  final out = await handleNotificationAction(WidgetRefReader(ref), s, a, DateTime.now());
                  if (!context.mounted) return;
                  switch (out) {
                    case Navigate(:final route):
                      context.go(route);
                    case Done(:final message):
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
                  }
                },
              ),
          SectionHeader('Katalog · ${NotifEvent.values.length} event'),
          SegmentedButton<NotifMode>(
            key: const Key('previewMode'),
            showSelectedIcon: false,
            segments: const [
              ButtonSegment(value: NotifMode.practice, label: Text('Practice')),
              ButtonSegment(value: NotifMode.real, label: Text('Real SOL')),
            ],
            selected: {previewMode},
            onSelectionChanged: (s) => ref.read(_previewModeProvider.notifier).state = s.first,
          ),
          const SizedBox(height: AppSpace.s2),
          for (final e in NotifEvent.values)
            if (!(e.spec.realOnly && previewMode == NotifMode.practice))
              NotificationTile(
                key: Key('catalog_${e.code}'),
                rendered: renderer.render(_sample(e, previewMode, now), locale, now),
                locale: locale,
                eventCode: e.code,
              ),
        ],
      ),
    );
  }

  static PushMessage _sample(NotifEvent e, NotifMode mode, DateTime now) => PushMessage(
    event: e,
    mode: mode,
    approvalId: 'apv_preview',
    positionId: 'ck100.0',
    token: 'tok_preview',
    expiresAt: now.toUtc().add(const Duration(minutes: 1, seconds: 42)),
    expireReason: 'timeout',
    vars: {
      'strategy': 'Pullback v2',
      // i18n 0.4.3: wire var names; `pnl`/`amount_lamports` are lamports strings.
      'pnl': e == NotifEvent.n09StopHit ? '-19000000' : '31000000',
      'pct': e == NotifEvent.n09StopHit ? '-9.5' : '50',
      'pct_sold': '33',
      'reason': 'Holder terlalu terkonsentrasi',
      'symbol': 'MOON',
      'side': 'buy',
      'reason_code': 'SLIPPAGE_EXCEEDED',
      'amount_lamports': '240000000',
      'setting': 'Top-10 holders',
      'from': '30%',
      'to': '40%',
      'cooldown_until': now.toUtc().add(const Duration(minutes: 10)).toIso8601String(),
      'auto_revert_at': now.toUtc().add(const Duration(hours: 24)).toIso8601String(),
      'price': '0.000412',
      'stop_type': 'Trailing stop',
    },
  );
}

/// OS-notification look-alike: priority stripe, title, body, buttons.
class NotificationTile extends StatelessWidget {
  const NotificationTile({
    super.key,
    required this.rendered,
    required this.locale,
    this.time,
    this.onAction,
    this.eventCode,
  });
  final RenderedNotification rendered;
  final NotifLocale locale;
  final DateTime? time;
  final String? eventCode;

  /// Null = preview only (buttons shown disabled).
  final Future<void> Function(NotifAction)? onAction;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final t = context.tradeColors;
    final tt = Theme.of(context).textTheme;
    final stripe = switch (rendered.priority) {
      NotifPriority.high => rendered.message.mode == NotifMode.real ? t.real : cs.primary,
      NotifPriority.normal => cs.outline,
      NotifPriority.low => cs.outlineVariant,
    };
    final channels = rendered.channels.map((c) => c.name).join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: AppSpace.s2),
      clipBehavior: Clip.antiAlias,
      child: Container(
        decoration: BoxDecoration(
          border: Border(left: BorderSide(color: stripe, width: 4)),
        ),
        padding: const EdgeInsets.fromLTRB(AppSpace.s3, AppSpace.s2, AppSpace.s3, AppSpace.s2),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    [
                      eventCode ?? rendered.message.event.code,
                      channels,
                      if (time != null) '${fmtTime(time!)} WIB',
                    ].join(' · '),
                    style: tt.labelSmall!.copyWith(color: cs.onSurfaceVariant),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpace.sHalf),
            Text(rendered.title, style: tt.titleSmall),
            Text(rendered.body, style: tt.bodyMedium),
            if (rendered.actions.isNotEmpty) ...[
              const SizedBox(height: AppSpace.s1),
              Wrap(
                spacing: AppSpace.s2,
                children: [
                  for (final a in rendered.actions)
                    TextButton(
                      key: Key('notifAction_${a.name}'),
                      onPressed: onAction == null ? null : () => onAction!(a),
                      child: Text(actionLabel(l10nFor(locale), a)),
                    ),
                ],
              ),
            ] else if (rendered.tapRoute != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpace.sHalf),
                child: Text(
                  locale == NotifLocale.id ? 'Tap → buka app' : 'Tap → open app',
                  style: tt.labelSmall!.copyWith(color: cs.onSurfaceVariant),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
