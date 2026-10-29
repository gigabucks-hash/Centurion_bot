import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/feature_flags.dart';
import 'practice_reset_tile.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  // Local-only in the prototype; persisted per device via the
  // `device_tokens` / `notification_prefs` tables in prod.
  bool _pushPicks = true;
  bool _pushSettings = true;
  bool _pushFills = false;
  bool _biometric = true;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Lainnya')),
      body: ListView(children: [
        ListTile(
          key: const Key('morePositions'),
          leading: const Icon(Icons.account_balance_wallet_outlined),
          title: const Text('Posisi'),
          subtitle: const Text('Open & closed, PnL per posisi'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go('/positions'),
        ),
        ListTile(
          key: const Key('moreNotifications'),
          leading: const Icon(Icons.notifications_outlined),
          title: const Text('Notifikasi'),
          subtitle: const Text('Bahasa ID/EN, notifikasi diterima, katalog 17 event'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.go('/more/notifications'),
        ),
        const _Header('Practice'),
        const PracticeResetTile(),
        Consumer(
          builder: (context, ref, _) => ListTile(
            key: const Key('realModeFlag'),
            leading: const Icon(Icons.lock_outline),
            title: const Text('Mode Real SOL'),
            subtitle: Text(realModeStatus(ref.watch(featureFlagsProvider).realSolEnabled)),
          ),
        ),
        const _Header('Notifications'),
        SwitchListTile(
          title: const Text('Buy picks waiting for approval'),
          value: _pushPicks,
          onChanged: (v) => setState(() => _pushPicks = v),
        ),
        SwitchListTile(
          title: const Text('Setting change requests'),
          value: _pushSettings,
          onChanged: (v) => setState(() => _pushSettings = v),
        ),
        SwitchListTile(
          title: const Text('Fills (bought / sold)'),
          value: _pushFills,
          onChanged: (v) => setState(() => _pushFills = v),
        ),
        const _Header('Security'),
        SwitchListTile(
          title: const Text('Biometric before approving'),
          subtitle: const Text('Selalu aktif untuk aksi Real SOL (tidak bisa dimatikan)'),
          value: _biometric,
          onChanged: (v) => setState(() => _biometric = v), // applies to Practice only
        ),
        const ListTile(
          leading: Icon(Icons.key_off_outlined),
          title: Text('No private keys on this device'),
          subtitle: Text('Signing happens server-side under policy limits'),
        ),
        const _Header('Account'),
        const ListTile(title: Text('Backend'), subtitle: Text('Mock (offline prototype)')),
        const ListTile(title: Text('Version'), subtitle: Text('0.1.0 prototype')),
        ListTile(
          leading: const Icon(Icons.logout),
          title: const Text('Sign out'),
          onTap: () => ScaffoldMessenger.of(context)
              .showSnackBar(const SnackBar(content: Text('Auth not wired in prototype'))),
        ),
      ]),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
        child: Text(text.toUpperCase(),
            style: Theme.of(context).textTheme.labelSmall!.copyWith(letterSpacing: 1.2)),
      );
}
