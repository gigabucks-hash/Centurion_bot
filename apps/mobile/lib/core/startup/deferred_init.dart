/// Startup budget (target cold start p95 < 2 s, ideally 1.5 s on a mid-range
/// Android): `main()` only calls `runApp`; nothing awaits before the first
/// frame. Services that are not needed to paint it (push token registration,
/// Realtime/marks connection, Telegram login SDK, analytics) register here
/// and start AFTER the first frame, one per event-loop turn so they don't
/// stack into a single long frame.
library;

import 'dart:async';

import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/providers.dart';

typedef DeferredTask = FutureOr<void> Function();

class DeferredInit {
  DeferredInit(this._tasks);
  final List<(String, DeferredTask)> _tasks;
  bool _scheduled = false;
  final _done = <String>[];

  /// Names of tasks that have completed (tests, diagnostics).
  List<String> get completed => List.unmodifiable(_done);

  /// Schedules every task after the next rendered frame. Idempotent.
  void scheduleAfterFirstFrame([SchedulerBinding? binding]) {
    if (_scheduled) return;
    _scheduled = true;
    (binding ?? SchedulerBinding.instance).addPostFrameCallback((_) => unawaited(_runAll()));
  }

  Future<void> _runAll() async {
    for (final (name, task) in _tasks) {
      await Future<void>.delayed(Duration.zero); // yield: one task per turn
      try {
        await task();
        _done.add(name);
      } catch (e, st) {
        // A failing optional service must never take the app down.
        FlutterError.reportError(FlutterErrorDetails(exception: e, stack: st, library: 'deferred_init: $name'));
      }
    }
  }
}

/// Composition: prod flavors override this with real push/Realtime/Telegram/
/// analytics starters. Mock: the backend's 2 s tick (stands in for Realtime).
final deferredInitProvider = Provider<DeferredInit>(
  (ref) => DeferredInit([
    ('realtime', () => ref.read(mockBackendProvider).start()),
    // ('push', ...)      FCM token + local notifications channel setup
    // ('telegram', ...)  only if featureFlags.telegramOidcEnabled
    // ('analytics', ...) none chosen yet (decision for Boss)
  ]),
);
