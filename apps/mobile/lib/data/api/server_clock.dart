/// Server clock offset. Every REST/RPC/stream payload carries `server_now`;
/// countdowns render `expires_at − (device now + skew)`, never device time alone.
library;

import 'package:flutter_riverpod/flutter_riverpod.dart';

class ServerClock extends Notifier<Duration> {
  @override
  Duration build() => Duration.zero;

  /// Record a `server_now` (ISO string or DateTime) observed at device time [localNow].
  void observe(Object serverNow, {DateTime? localNow}) {
    final s = serverNow is DateTime ? serverNow : DateTime.tryParse('$serverNow');
    if (s == null) return;
    state = s.toUtc().difference((localNow ?? DateTime.now()).toUtc());
  }

  DateTime now() => DateTime.now().add(state);
}

/// skew = server_now − device now.
final serverClockProvider = NotifierProvider<ServerClock, Duration>(ServerClock.new);
