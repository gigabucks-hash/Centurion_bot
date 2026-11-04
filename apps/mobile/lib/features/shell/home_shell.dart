import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/notifications/local_notifier.dart';
import '../../core/theme/centurion_theme.dart';
import '../../core/widgets/app_icons.dart';
import '../../core/widgets/common.dart';
import '../../data/providers.dart';

/// G1-blue nav: Home / Bots / Activity / Risk / Settings. Approvals are not a tab any more;
/// they surface as the badge on Risk plus the queue behind the bell, guard banner and Risk tab.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(pushPipelineProvider); // mock FCM -> local notifications
    final pending = ref.watch(pendingCountProvider);
    final mode = ref.watch(workspaceModeProvider);
    final t = context.tradeColors;
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            ModeBanner(mode),
            Expanded(child: shell),
          ],
        ),
      ),
      bottomNavigationBar: DecoratedBox(
        decoration: BoxDecoration(
          color: t.chrome,
          border: Border(top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant)),
        ),
        child: NavigationBar(
          backgroundColor: t.chrome,
          surfaceTintColor: const Color(0x00000000),
          selectedIndex: shell.currentIndex,
          onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
          destinations: [
            const NavigationDestination(
              icon: Icon(AppIcons.navHome),
              selectedIcon: Icon(AppIcons.navHome),
              label: 'Home',
            ),
            const NavigationDestination(
              icon: Icon(AppIcons.navBots),
              selectedIcon: Icon(AppIcons.navBots),
              label: 'Bots',
            ),
            const NavigationDestination(
              icon: Icon(AppIcons.navActivity),
              selectedIcon: Icon(AppIcons.navActivity),
              label: 'Activity',
            ),
            NavigationDestination(
              icon: _approvalsBadge(pending, t, const Icon(AppIcons.navRisk)),
              selectedIcon: _approvalsBadge(pending, t, const Icon(AppIcons.navRiskActive)),
              label: 'Risk',
            ),
            const NavigationDestination(
              icon: Icon(AppIcons.navSettings),
              selectedIcon: Icon(AppIcons.navSettings),
              label: 'Settings',
            ),
          ],
        ),
      ),
    );
  }

  /// Pending approvals ride on the Risk tab (UX G4): warning fill + onWarning ink, never Material's red.
  Widget _approvalsBadge(int pending, TradeColors t, Widget child) => Badge(
    isLabelVisible: pending > 0,
    backgroundColor: t.warning,
    textColor: t.onWarning,
    label: Text('$pending'),
    child: child,
  );
}
