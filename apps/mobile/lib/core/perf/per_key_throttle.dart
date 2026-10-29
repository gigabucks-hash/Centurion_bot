/// Per-key rate limit for live streams (marks): at most one event per key per
/// [interval]. Leading edge goes out immediately; while the window is open only
/// the LATEST value is kept and emitted when it closes (trailing edge), so the
/// last price is never lost. Events whose key is null pass through untouched
/// (e.g. `clock` messages). Timer-based, so it works under fake time in tests.
library;

import 'dart:async';

class PerKeyThrottle<T, K extends Object> extends StreamTransformerBase<T, T> {
  PerKeyThrottle({required this.keyOf, this.interval = const Duration(milliseconds: 250)});

  /// 250 ms = 4 Hz per row (target: ≤ 4–5 Hz per live price row).
  final Duration interval;
  final K? Function(T event) keyOf;

  @override
  Stream<T> bind(Stream<T> stream) {
    final timers = <K, Timer>{};
    final pending = <K, T>{};
    StreamSubscription<T>? sub;
    late StreamController<T> out;
    var sourceDone = false;

    void maybeClose() {
      if (sourceDone && timers.isEmpty && !out.isClosed) out.close();
    }

    void openWindow(K key) {
      timers[key] = Timer(interval, () {
        timers.remove(key);
        if (pending.containsKey(key)) {
          final v = pending.remove(key) as T;
          if (!out.isClosed) out.add(v);
          openWindow(key);
        } else {
          maybeClose();
        }
      });
    }

    out = StreamController<T>(
      sync: true,
      onListen: () {
        sub = stream.listen(
          (e) {
            final key = keyOf(e);
            if (key == null) {
              out.add(e);
            } else if (timers.containsKey(key)) {
              pending[key] = e; // replace: only the newest value matters
            } else {
              out.add(e);
              openWindow(key);
            }
          },
          onError: out.addError,
          onDone: () {
            sourceDone = true;
            maybeClose();
          },
        );
      },
      onPause: () => sub?.pause(),
      onResume: () => sub?.resume(),
      onCancel: () {
        for (final t in timers.values) {
          t.cancel();
        }
        timers.clear();
        pending.clear();
        return sub?.cancel();
      },
    );
    return out.stream;
  }
}
