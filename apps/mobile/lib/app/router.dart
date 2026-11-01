import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../features/activity/activity_screen.dart';
import '../features/approvals/approvals_screen.dart';
import '../features/approvals/guard_review_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/coins/coins_screen.dart';
import '../features/dashboard/dashboard_screen.dart';
import '../features/positions/positions_screen.dart';
import '../features/settings/notifications_screen.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/home_shell.dart';
import '../features/strategies/strategies_screen.dart';

/// [isSignedIn] + [authChanges]: wallet-login gate (prod). Null = no gate (mock build,
/// widget tests); `/login` is always routable.
GoRouter buildRouter({String initialLocation = '/', bool Function()? isSignedIn, Listenable? authChanges}) {
  final rootKey = GlobalKey<NavigatorState>();
  return GoRouter(
    navigatorKey: rootKey,
    initialLocation: initialLocation,
    refreshListenable: authChanges,
    redirect: isSignedIn == null
        ? null
        : (_, state) {
            final atLogin = state.matchedLocation == '/login';
            final ok = isSignedIn();
            if (!ok && !atLogin) return '/login';
            if (ok && atLogin) return '/';
            return null;
          },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginScreen()),
      StatefulShellRoute.indexedStack(
        builder: (_, _, shell) => HomeShell(shell: shell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                builder: (_, _) => const DashboardScreen(),
                routes: [
                  GoRoute(
                    path: 'coins',
                    builder: (_, _) => const CoinsScreen(),
                    routes: [
                      GoRoute(path: ':symbol', builder: (_, s) => CoinDetailScreen(s.pathParameters['symbol']!)),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/strategies', builder: (_, _) => const StrategiesScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/approvals',
                builder: (_, _) => const ApprovalsScreen(),
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
            ],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/activity', builder: (_, _) => const ActivityScreen())],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/more',
                builder: (_, _) => const SettingsScreen(),
                routes: [GoRoute(path: 'notifications', builder: (_, _) => const NotificationsScreen())],
              ),
              // Wireframe 12: Positions lives under the Lainnya tab. Path kept
              // as `/positions` so push deep links stay short and stable.
              GoRoute(
                path: '/positions',
                builder: (_, _) => const PositionsScreen(),
                routes: [
                  GoRoute(
                    path: ':id',
                    builder: (_, s) => PositionDetailScreen(positionId: s.pathParameters['id']!),
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  );
}
