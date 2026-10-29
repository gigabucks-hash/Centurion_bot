import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sentra_mobile/app/app.dart';
import 'package:sentra_mobile/core/perf/background_json.dart';
import 'package:sentra_mobile/core/perf/per_key_throttle.dart';
import 'package:sentra_mobile/core/startup/deferred_init.dart';
import 'package:sentra_mobile/data/api/marks.dart';
import 'package:sentra_mobile/data/mock/mock_backend.dart';
import 'package:sentra_mobile/data/models/models.dart';
import 'package:sentra_mobile/data/providers.dart';

MarkMessage _mark(String mint, String price) => MarkMessage(
  mint: mint,
  priceUsd: Decimal.parse(price),
  ts: DateTime.utc(2026, 10, 29),
  positionIds: const [],
  serverNow: DateTime.utc(2026, 10, 29),
);

Map<String, Object?> _env(int seq) => {
  'id': 'p$seq:1:fill.simulated',
  'seq': '$seq',
  'type': 'fill.simulated',
  'version': 1,
  'workspace_id': 'ws',
  'strategy_id': null,
  'ts': '2026-10-29T10:00:00Z',
  'actor': 'system',
  'mode': 'practice',
  'payload': {'order_id': 'o$seq', 'practice_epoch': 0},
  'untrusted': const <String, Object?>{},
};

void main() {
  group('PerKeyThrottle (marks ≤ 4 Hz per row)', () {
    testWidgets('leading edge now, latest value on the trailing edge, ≤ 1 per 250 ms per key', (tester) async {
      final src = StreamController<MarkMessage>();
      final got = <String>[];
      final sub = src.stream
          .transform(PerKeyThrottle<MarkMessage, String>(keyOf: (m) => m.mint))
          .listen((m) => got.add('${m.mint}=${m.priceUsd}'));
      // 20 Hz burst on A for 1 s, plus one B.
      for (var i = 0; i < 20; i++) {
        src.add(_mark('A', '${100 + i}'));
        if (i == 3) src.add(_mark('B', '9'));
        await tester.pump(const Duration(milliseconds: 50));
      }
      await tester.pump(const Duration(milliseconds: 600)); // drain trailing edges
      final a = got.where((s) => s.startsWith('A=')).toList();
      expect(a.first, 'A=100', reason: 'leading edge is immediate');
      expect(a.last, 'A=119', reason: 'the newest price is never dropped');
      // 1 s of input + trailing → at most 1 + 1000/250 + 1 emissions.
      expect(a.length, lessThanOrEqualTo(6));
      expect(a.length, greaterThanOrEqualTo(4));
      expect(got.where((s) => s.startsWith('B=')), ['B=9'], reason: 'keys are independent');
      unawaited(sub.cancel());
      unawaited(src.close());
      await tester.pump();
    });

    testWidgets('null key (clock) passes through unthrottled; cancel leaves no timers', (tester) async {
      final src = StreamController<int>();
      final got = <int>[];
      final sub = src.stream.transform(PerKeyThrottle<int, String>(keyOf: (v) => v < 0 ? null : 'k')).listen(got.add);
      for (final v in [-1, -2, 1, 2, -3]) {
        src.add(v);
      }
      await tester.pump();
      expect(got, [-1, -2, 1, -3]);
      unawaited(sub.cancel()); // pending trailing value + timer discarded
      await tester.pump(const Duration(seconds: 1));
      expect(got, [-1, -2, 1, -3]);
      unawaited(src.close());
      await tester.pump();
    });
  });

  group('parseEventsPage (large JSON off the UI isolate)', () {
    final small = jsonEncode({
      'items': [
        _env(1),
        _env(2),
        {'bad': true},
      ],
      'next_after_seq': '2',
      'next_before_seq': null,
    });
    final big = jsonEncode({
      'items': [for (var i = 1; i <= 600; i++) _env(i)],
      'next_after_seq': '9007199254740993', // > 2^53: stays exact (BigInt)
      'next_before_seq': '1',
    });

    test('small page: synchronous, malformed rows dropped and counted', () async {
      expect(small.length, lessThan(backgroundJsonThreshold));
      final p = await parseEventsPage(small);
      expect(p.items.map((e) => e.seq), [BigInt.one, BigInt.two]);
      expect(p.dropped, 1);
      expect(p.nextAfterSeq, BigInt.two);
      expect(p.nextBeforeSeq, isNull);
    });

    test('large page goes through compute and equals the sync result', () async {
      expect(big.length, greaterThanOrEqualTo(backgroundJsonThreshold));
      final bg = await parseEventsPage(big);
      final sync = parseEventsPageSync(big);
      expect(bg.items.length, 600);
      expect(bg.items.map((e) => e.id), sync.items.map((e) => e.id));
      expect(bg.nextAfterSeq, BigInt.parse('9007199254740993'));
    });
  });

  group('startup: nothing heavy before the first frame', () {
    testWidgets('deferred tasks run only after the first frame, in order', (tester) async {
      final log = <String>[];
      final init = DeferredInit([('push', () => log.add('push')), ('realtime', () => log.add('realtime'))]);
      final b = MockBackend();
      addTearDown(b.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: [mockBackendProvider.overrideWithValue(b), deferredInitProvider.overrideWithValue(init)],
          child: const SentraApp(),
        ),
      );
      // pumpWidget rendered frame 1; the post-frame callback has only queued the tasks.
      expect(log, isEmpty);
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
      expect(log, ['push', 'realtime']);
      expect(init.completed, ['push', 'realtime']);
    });

    testWidgets('a failing optional service is reported, the rest still start', (tester) async {
      final log = <String>[];
      final init = DeferredInit([('telegram', () => throw StateError('sdk down')), ('push', () => log.add('push'))]);
      await tester.pumpWidget(const SizedBox());
      init.scheduleAfterFirstFrame();
      tester.binding.scheduleFrame();
      await tester.pump(const Duration(milliseconds: 10));
      await tester.pump(const Duration(milliseconds: 10));
      expect(tester.takeException(), isA<StateError>());
      expect(log, ['push']);
      expect(init.completed, ['push']);
    });

    test('the default provider does not start the mock tick until scheduled', () {
      final c = ProviderContainer();
      addTearDown(c.dispose);
      final b = c.read(mockBackendProvider);
      expect(b.isTicking, isFalse);
    });

    testWidgets('liveMarkProvider throttles one row to ≤ 4 Hz', (tester) async {
      final src = StreamController<MarksMessage>.broadcast();
      final c = ProviderContainer(overrides: [marksSourceProvider.overrideWithValue(_FakeMarks(src.stream))]);
      final seen = <Decimal>[];
      final key = (mint: 'MINT', mode: TradeMode.practice);
      final sub = c.listen(liveMarkProvider(key), (_, next) {
        final v = next.valueOrNull;
        if (v != null) seen.add(v.priceUsd);
      });
      await tester.pump();
      for (var i = 0; i < 40; i++) {
        src.add(_mark(i.isEven ? 'MINT' : 'OTHER', '$i'));
        await tester.pump(const Duration(milliseconds: 25)); // 40 Hz input, 20 Hz for MINT
      }
      await tester.pump(const Duration(milliseconds: 600));
      // 1 s of input → ≤ 1 + 4 + 1 updates for this row; last price kept.
      expect(seen.length, lessThanOrEqualTo(6));
      expect(seen.last, Decimal.fromInt(38));
      sub.close();
      c.dispose();
      unawaited(src.close());
      await tester.pump(const Duration(seconds: 1));
    });
  });
}

class _FakeMarks implements MarksSource {
  _FakeMarks(this.stream);
  final Stream<MarksMessage> stream;
  @override
  Stream<MarksMessage> watchMarks(String workspaceId, TradeMode mode) => stream;
}
