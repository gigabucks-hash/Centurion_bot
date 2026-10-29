/// Contract v1.1 live data: ONE seq-ordered feed (`public.events`) instead of
/// `postgres_changes` on positions/approvals/strategies (v1.1 update §4,
/// EVENTS_SCHEMA §2–3). Repositories refetch the affected rows on an event.
///
/// Resume rule: apply live rows immediately (dedupe by `id`), but persist the
/// watermark only from REST `next_after_seq`, SSE `id` or Broadcast
/// `clock.safe_seq`, never from a raw Realtime row (seq is monotonic, not gapless).
library;

import '../models/models.dart';
import 'wire.dart';

class EventEnvelope {
  const EventEnvelope({
    required this.id,
    required this.seq,
    required this.type,
    required this.version,
    required this.workspaceId,
    required this.mode,
    required this.ts,
    required this.actor,
    required this.payload,
    this.strategyId,
    this.ck,
    this.mint,
    this.untrusted = const {},
    this.serverNow,
  });

  /// `<subject>:<epoch_ms>:<type>`; dedupe key.
  final String id;
  final int seq;
  final String type;
  final int version;
  final String workspaceId;
  final TradeMode mode;
  final DateTime ts;
  final String actor;
  final Map<String, Object?> payload;
  final String? strategyId, ck, mint;

  /// Attacker-controlled token metadata: display as plain text only.
  final Map<String, Object?> untrusted;
  final DateTime? serverNow;

  /// Null for unknown mode or malformed rows (fail closed). Unknown `type`s parse
  /// fine; consumers ignore them.
  static EventEnvelope? tryParse(Map<String, Object?> j) {
    final mode = Wire.modeOf(j['mode'] as String?);
    final seq = j['seq'];
    final id = j['id'];
    final ts = DateTime.tryParse('${j['ts']}');
    if (mode == null || seq is! num || id is! String || ts == null || j['type'] is! String) return null;
    return EventEnvelope(
      id: id,
      seq: seq.toInt(),
      type: j['type']! as String,
      version: (j['version'] as num?)?.toInt() ?? 1,
      workspaceId: '${j['workspace_id']}',
      mode: mode,
      ts: ts,
      actor: '${j['actor']}',
      payload: (j['payload'] as Map?)?.cast<String, Object?>() ?? const {},
      strategyId: j['strategy_id'] as String?,
      ck: j['ck'] as String?,
      mint: j['mint'] as String?,
      untrusted: (j['untrusted'] as Map?)?.cast<String, Object?>() ?? const {},
      serverNow: DateTime.tryParse('${j['server_now']}'),
    );
  }

  /// Which repository must refetch on this event.
  EventTopic get topic => switch (type.split('.').first) {
        'proposal' => EventTopic.approvals,
        'position' || 'fill' || 'exit' || 'portfolio' => EventTopic.portfolio,
        'strategy' || 'guard' => EventTopic.strategies,
        'practice' => EventTopic.all,
        _ => EventTopic.activity,
      };
}

enum EventTopic { approvals, portfolio, strategies, activity, all }

/// Dedupe + ordering + resume watermark for the events feed.
class EventSequencer {
  EventSequencer({this.watermark = 0, this.maxRemembered = 2000});

  /// Persisted resume point (safe). Only advanced by [advanceSafe].
  int watermark;
  final int maxRemembered;
  final _seen = <String>{};
  final _order = <String>[];

  /// True if [e] is new (not seen by id, and not at/below the safe watermark).
  bool accept(EventEnvelope e) {
    if (e.seq <= watermark) return false;
    if (!_seen.add(e.id)) return false;
    _order.add(e.id);
    if (_order.length > maxRemembered) _seen.remove(_order.removeAt(0));
    return true;
  }

  /// From REST `next_after_seq`, SSE `id` or Broadcast `clock.safe_seq`.
  void advanceSafe(int safeSeq) {
    if (safeSeq > watermark) watermark = safeSeq;
  }

  /// Sorts a catch-up page by seq (never by ts) and keeps only new events.
  List<EventEnvelope> acceptAll(Iterable<EventEnvelope> page) =>
      ([...page]..sort((a, b) => a.seq.compareTo(b.seq))).where(accept).toList();
}

/// Prod: Realtime INSERT on `public.events` (filter workspace_id) + `GET /v1/events?after_seq=`
/// catch-up loop; mock: `MockBackend.watchEvents`.
abstract interface class EventsFeed {
  Stream<EventEnvelope> watchEvents(String workspaceId, TradeMode mode, {int afterSeq = 0});
}
