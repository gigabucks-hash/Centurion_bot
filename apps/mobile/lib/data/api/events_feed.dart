/// Contract v1.1 live data: ONE seq-ordered feed (`public.events`) instead of
/// `postgres_changes` on positions/approvals/strategies (v1.1 update §4,
/// EVENTS_SCHEMA §2–3). Repositories refetch the affected rows on an event.
///
/// Resume rule: apply live rows immediately (dedupe by `id`), but persist the
/// watermark only from REST `next_after_seq`, SSE `id` or Broadcast
/// `clock.safe_seq`, never from a raw Realtime row (seq is monotonic, not gapless).
///
/// 1.1.2: `seq` is an int64 integer STRING (JS-safe); compared as [BigInt], never
/// lexically ("10" > "9"). Payloads carry `practice_epoch`; [PracticeEpochGate]
/// drops old-epoch rows after a reset.
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
  final BigInt seq;
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
    final seq = Wire.seqOf(j['seq']);
    final id = j['id'];
    final ts = DateTime.tryParse('${j['ts']}');
    if (mode == null || seq == null || id is! String || ts == null || j['type'] is! String) return null;
    return EventEnvelope(
      id: id,
      seq: seq,
      type: j['type']! as String,
      version: Wire.intOf(j['version']) ?? 1,
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

  /// `payload.practice_epoch` (position/fill/portfolio rows); null when absent.
  int? get practiceEpoch => Wire.intOf(payload['practice_epoch']);

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
  EventSequencer({BigInt? watermark, this.maxRemembered = 2000}) : watermark = watermark ?? BigInt.zero;

  /// Persisted resume point (safe). Only advanced by [advanceSafe]. Persist as
  /// `watermark.toString()` (int64 string), never as a JS/double number.
  BigInt watermark;
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
  /// Accepts the wire string (or a [BigInt]/int); unparsable values are ignored.
  void advanceSafe(Object? safeSeq) {
    final v = safeSeq is BigInt ? safeSeq : Wire.seqOf(safeSeq);
    if (v != null && v > watermark) watermark = v;
  }

  /// Sorts a catch-up page by seq (never by ts) and keeps only new events.
  List<EventEnvelope> acceptAll(Iterable<EventEnvelope> page) =>
      ([...page]..sort((a, b) => a.seq.compareTo(b.seq))).where(accept).toList();
}

/// Prod: Realtime INSERT on `public.events` (filter workspace_id) + `GET /v1/events?after_seq=`
/// catch-up loop; mock: `MockBackend.watchEvents`.
abstract interface class EventsFeed {
  Stream<EventEnvelope> watchEvents(String workspaceId, TradeMode mode, {BigInt? afterSeq});
}

/// `practice_epoch` gate (1.1.2): after `practice.reset` (or a workspace/portfolio
/// read with a newer epoch) every row from an older epoch is dropped, so late
/// fills/marks/positions from the archived run never reappear. Real rows have
/// no epoch and always pass.
class PracticeEpochGate {
  PracticeEpochGate({this.epoch = 0});

  /// Current practice epoch (monotonic; only ever moves forward).
  int epoch;

  /// Raise the epoch from a workspace / portfolio / snapshot read.
  void observe(int? e) {
    if (e != null && e > epoch) epoch = e;
  }

  /// False for rows from an older epoch. `practice.reset` moves the gate.
  bool accept(EventEnvelope e) {
    if (e.type == 'practice.reset') {
      observe(Wire.intOf(e.payload['epoch']));
      return true;
    }
    final pe = e.practiceEpoch;
    return pe == null || pe >= epoch;
  }

  /// Drop cached practice positions from older epochs.
  List<Position> filter(Iterable<Position> ps) =>
      ps.where((p) => p.mode != TradeMode.practice || p.practiceEpoch >= epoch).toList();
}
