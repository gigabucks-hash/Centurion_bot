import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/notifications/local_notifier.dart';
import '../../core/widgets/common.dart';
import '../../data/providers.dart';

/// 5-tab shell per SPEC (Home · Strategi · Approvals · Activity · Lainnya)
/// with the non-dismissable mode banner above every tab.
class HomeShell extends ConsumerWidget {
  const HomeShell({super.key, required this.shell});
  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(pushPipelineProvider); // mock FCM → local notifications
    final pending = ref.watch(pendingCountProvider);
    final mode = ref.watch(workspaceModeProvider);
    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: Column(children: [ModeBanner(mode), Expanded(child: shell)]),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (i) => shell.goBranch(i, initialLocation: i == shell.currentIndex),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          const NavigationDestination(icon: Icon(Icons.tune), label: 'Strategi'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: pending > 0,
              label: Text('$pending'),
              child: const Icon(Icons.how_to_vote_outlined),
            ),
            label: 'Approvals',
          ),
          const NavigationDestination(icon: Icon(Icons.bolt_outlined), label: 'Activity'),
          const NavigationDestination(icon: Icon(Icons.more_horiz), label: 'Lainnya'),
        ],
      ),
    );
  }
}
