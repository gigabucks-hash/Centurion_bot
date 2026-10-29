/// Mark prices over Supabase Realtime Broadcast (EVENTS_SCHEMA §3):
/// private channel `marks:<workspace_id>:<mode>`, events `mark` and `clock`
/// (every 15 s). Not persisted; authoritative numbers come from
/// `portfolio.snapshot` / `GET /portfolio/overview`.
library;

import '../models/models.dart';
import 'wire.dart';

String marksChannel(String workspaceId, TradeMode mode) => 'marks:$workspaceId:${Wire.mode(mode)}';

sealed class MarksMessage {
  const MarksMessage(this.serverNow);
  final DateTime serverNow;

  /// Parses a Broadcast `{event, payload}`; unknown events → null.
  static MarksMessage? fromBroadcast(Map<String, Object?> msg) {
    final p = (msg['payload'] as Map?)?.cast<String, Object?>();
    if (p == null) return null;
    final now = DateTime.tryParse('${p['server_now']}');
    if (now == null) return null;
    return switch (msg['event']) {
      'mark' => MarkMessage(
          mint: p['mint']! as String,
          // Decimal string on the wire; never parsed as double.
          priceUsd: Decimal.parse(p['price_usd']! as String),
          ts: DateTime.parse(p['ts']! as String),
          positionIds: [...?(p['position_ids'] as List?)?.cast<String>()],
          serverNow: now,
        ),
      'clock' => ClockMessage(safeSeq: (p['safe_seq'] as num?)?.toInt() ?? 0, serverNow: now),
      _ => null,
    };
  }
}

class MarkMessage extends MarksMessage {
  const MarkMessage(
      {required this.mint, required this.priceUsd, required this.ts, required this.positionIds, required DateTime serverNow})
      : super(serverNow);
  final String mint;
  final Decimal priceUsd;
  final DateTime ts;
  final List<String> positionIds;
}

class ClockMessage extends MarksMessage {
  const ClockMessage({required this.safeSeq, required DateTime serverNow}) : super(serverNow);
  final int safeSeq;
}

/// Prod: Supabase `channel(marksChannel(ws, mode), private: true).onBroadcast(...)`.
abstract interface class MarksSource {
  Stream<MarksMessage> watchMarks(String workspaceId, TradeMode mode);
}
