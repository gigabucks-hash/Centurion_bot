import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/activity/activity_screen.dart';
import '../features/approvals/approvals_screen.dart';
import '../features/approvals/guard_review_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/positions/positions_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/home_shell.dart';
import '../features/strategies/strategies_screen.dart';

GoRouter buildRouter({String initialLocation = '/'}) {
  final rootKey = GlobalKey<NavigatorState>();
  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: initialLocation,
    routes: [
      StatefulShellRoute.indexedStack(
        builder: (_, __, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(path: '/', builder: (_, __) => const DashboardScreen(), routes: [
              GoRoute(
                path: 'positions',
                builder: (_, __) => const PositionsScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (_, s) => PositionDetailScreen(positionId: s.pathParameters['id']!),
                  ),
                ],
              ),
            ]),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/strategies', builder: (_, __) => const StrategiesScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/approvals',
              builder: (_, __) => const ApprovalsScreen(),
              routes: [
                // Push deep link target: highlights the approval in the inbox.
                GoRoute(
                  path: ':id',
                  builder: (_, s) => ApprovalsScreen(highlightId: s.pathParameters['id']),
                  routes: [
                    // Guard change review: full-screen dialog over the shell.
                    GoRoute(
                      path: 'review',
                      parentNavigatorKey: rootKey,
                      pageBuilder: (_, s) => MaterialPage(
                        fullscreenDialog: true,
                        child: GuardReviewScreen(approvalId: s.pathParameters['id']!),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/activity', builder: (_, __) => const ActivityScreen()),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(path: '/more', builder: (_, __) => const SettingsScreen()),
          ]),
        ],
      ),
    ],
  );
}
