/// Large JSON off the UI isolate. `jsonDecode` + model mapping of a big page
/// (e.g. `GET /v1/events?after_seq=` catch-up after a long background, up to
/// hundreds of envelopes) can take several ms on a mid-range phone, enough to
/// drop frames at 60 fps (16.6 ms budget). Bodies ≥ [backgroundJsonThreshold]
/// bytes are parsed in a background isolate via `compute` (on web `compute`
/// runs inline). Small bodies stay synchronous: isolate spawn costs ~1–3 ms.
library;

import 'dart:convert';

import 'package:flutter/foundation.dart';

import '../../data/api/events_feed.dart';

const backgroundJsonThreshold = 32 * 1024;

/// `GET /v1/events` response (contracts `EventsPage`).
class EventsPage {
  const EventsPage({required this.items, required this.nextAfterSeq, required this.nextBeforeSeq, this.dropped = 0});
  final List<EventEnvelope> items;
  final BigInt? nextAfterSeq, nextBeforeSeq;

  /// Rows that failed [EventEnvelope.tryParse] (fail closed: skipped, counted).
  final int dropped;
}

/// Synchronous parser (also the isolate entry point; must stay top-level).
EventsPage parseEventsPageSync(String body) {
  final j = (jsonDecode(body) as Map).cast<String, Object?>();
  final items = <EventEnvelope>[];
  var dropped = 0;
  for (final raw in (j['items'] as List?) ?? const []) {
    final e = raw is Map ? EventEnvelope.tryParse(raw.cast<String, Object?>()) : null;
    if (e == null) {
      dropped++;
    } else {
      items.add(e);
    }
  }
  BigInt? seq(Object? v) => v is String ? BigInt.tryParse(v) : null;
  return EventsPage(
    items: items,
    nextAfterSeq: seq(j['next_after_seq']),
    nextBeforeSeq: seq(j['next_before_seq']),
    dropped: dropped,
  );
}

/// Parses in the background when [body] is large (or when [forceIsolate]).
Future<EventsPage> parseEventsPage(String body, {bool forceIsolate = false}) {
  if (!forceIsolate && body.length < backgroundJsonThreshold) {
    return SynchronousFuture(parseEventsPageSync(body));
  }
  return compute(parseEventsPageSync, body, debugLabel: 'parseEventsPage');
}
