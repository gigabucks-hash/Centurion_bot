import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';

import 'support/contracts_source.dart';
import 'package:centurion_mobile/core/error_l10n.g.dart';
import 'package:centurion_mobile/core/exit_reason_l10n.dart';
import 'package:centurion_mobile/core/l10n_format.dart';
import 'package:centurion_mobile/core/perf/latest_throttle.dart';
import 'package:centurion_mobile/data/api/api_exception.dart';
import 'package:centurion_mobile/data/api/settings_keys.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/repositories/repositories.dart';
import 'package:centurion_mobile/features/approvals/approvals_screen.dart' show decideRequest;
import 'package:centurion_mobile/l10n/gen/app_localizations_en.dart';
import 'package:centurion_mobile/l10n/gen/app_localizations_id.dart';

Matcher _api(String code) => throwsA(isA<ApiException>().having((e) => e.rawCode, 'code', code));

Approval _pick(DateTime now, {String id = 'apv_q', TradeMode mode = TradeMode.real, ProposalQuote? quote}) => Approval(
  id: id,
  kind: ApprovalKind.buyPick,
  status: ApprovalStatus.pending,
  title: 'Buy QQQ',
  detail: 'x',
  createdAt: now,
  expiresAt: now.add(const Duration(minutes: 10)),
  token: 'tok_$id',
  mode: mode,
  strategyId: 'stg_pullback',
  amountLamports: Lamports.parse('250000000'),
  quote: quote,
);

void main() {
  group('1.1.4 cursor paging (mock keyset)', () {
    test('pages newest-first, opaque next_cursor, null on the last page, no duplicates', () async {
      final b = MockBackend();
      final all = <ActivityEvent>[];
      String? cursor;
      var pages = 0;
      do {
        final p = await b.fetchFeedPage(cursor: cursor, limit: 3);
        all.addAll(p.items);
        cursor = p.nextCursor;
        pages++;
      } while (cursor != null && pages < 100);
      expect(cursor, isNull);
      expect(all.map((e) => e.id).toSet(), hasLength(all.length));
      for (var i = 1; i < all.length; i++) {
        expect(!all[i].at.isAfter(all[i - 1].at), isTrue, reason: 'newest first');
      }
      expect(all, hasLength((await b.fetchFeedPage(limit: 100)).items.length));
      b.dispose();
    });

    test('CURSOR_INVALID for malformed or foreign cursors; limit 1..100', () async {
      final b = MockBackend();
      await expectLater(() => b.fetchFeedPage(cursor: '!!!'), _api('CURSOR_INVALID'));
      final pos = await b.fetchPositionsPage(limit: 1);
      if (pos.nextCursor != null) {
        await expectLater(
          () => b.fetchFeedPage(cursor: pos.nextCursor),
          _api('CURSOR_INVALID'),
          reason: 'cursor of another list',
        );
      }
      await expectLater(() => b.fetchFeedPage(limit: 101), _api('VALIDATION_FAILED'));
      b.dispose();
    });

    test('PagedListController accumulates, dedupes and restarts once on CURSOR_INVALID', () async {
      var calls = <String?>[];
      var invalidOnce = true;
      Future<CursorPage<int>> fetch({String? cursor, int limit = defaultPageLimit}) async {
        calls.add(cursor);
        if (cursor == 'c2' && invalidOnce) {
          invalidOnce = false;
          throw ApiException.fromCode('CURSOR_INVALID');
        }
        return switch (cursor) {
          null => const CursorPage(items: [9, 8, 7], nextCursor: 'c2'),
          _ => const CursorPage(items: [7, 6], nextCursor: null),
        };
      }

      final c = PagedListController<int>(fetch, idOf: (i) => '$i');
      await c.refresh();
      expect(c.state.items, [9, 8, 7]);
      await c.loadMore(); // c2 → CURSOR_INVALID → restart from page 1
      expect(calls, [null, 'c2', null]);
      expect(c.state.items, [9, 8, 7]);
      await c.loadMore();
      expect(c.state.items, [9, 8, 7, 6]);
      expect(c.state.done, isTrue);
      c.mergeHead([10, 9]);
      expect(c.state.items, [10, 9, 8, 7, 6]);
      calls = [];
      await c.loadMore();
      expect(calls, isEmpty, reason: 'done: no more fetches');
    });

    test('mergeHeadAndPages: head wins, sorted', () {
      expect(mergeHeadAndPages([5, 3], [4, 3, 1], (i) => '$i', (a, b) => b.compareTo(a)), [5, 4, 3, 1]);
    });
  });

  group('1.1.4 proposal quote', () {
    test('ProposalQuote.fromJson: *_lamports / min_out_raw BigInt strings, bps ints, state by server time', () {
      final q = ProposalQuote.fromJson({
        'est_network_fee_lamports': '25000',
        'priority_fee_lamports': '20000',
        'swap_fee_bps': 100,
        'max_slippage_bps': 300,
        'min_out_raw': '123456789012345678901234567890',
        'total_max_lamports': '250025000',
        'quote_ts': '2026-10-29T08:00:00Z',
        'quote_expires_at': '2026-10-29T08:00:15Z',
      })!;
      expect(q.minOutRaw, BigInt.parse('123456789012345678901234567890'));
      expect(q.totalMax, Lamports.parse('250025000'));
      expect(q.swapFeeBps, 100);
      expect(q.stateAt(DateTime.utc(2026, 10, 29, 8, 0, 10)), QuoteState.fresh);
      expect(q.stateAt(DateTime.utc(2026, 10, 29, 8, 0, 15)), QuoteState.stale);
    });

    test('Real approve: missing/stale quote → 409 QUOTE_MISSING_OR_STALE; Practice never blocked', () async {
      var now = DateTime.utc(2026, 10, 29, 8);
      final b = MockBackend(clock: () => now, realSolEnabled: true)
        ..debugAddApproval(_pick(now))
        ..debugAddApproval(_pick(now, id: 'apv_p', mode: TradeMode.practice));
      final real = b.debugApprovals.firstWhere((a) => a.id == 'apv_q');
      await expectLater(() => b.decide(decideRequest(real, approve: true)), _api('QUOTE_MISSING_OR_STALE'));
      final practice = b.debugApprovals.firstWhere((a) => a.id == 'apv_p');
      expect(quoteBlocksApprove(practice, now), isFalse);
      // refresh → fresh quote, rev + 1 → approve with the new rev works.
      final fresh = await b.refreshApproval('apv_q');
      expect(fresh.rev, real.rev + 1);
      expect(fresh.quote!.stateAt(now), QuoteState.fresh);
      await expectLater(
        () => b.decide(decideRequest(real, approve: true)),
        _api('VERSION_CONFLICT'),
        reason: 'old rev',
      );
      now = now.add(const Duration(seconds: 16));
      await expectLater(() => b.decide(decideRequest(fresh, approve: true)), _api('QUOTE_MISSING_OR_STALE'));
      b.dispose();
    });

    test('quote refresh emits a silent proposal.updated with the new rev and wire quote fields', () async {
      final now = DateTime.utc(2026, 10, 29, 8);
      final b = MockBackend(clock: () => now)..debugAddApproval(_pick(now, mode: TradeMode.practice));
      final events = <Map<String, Object?>>[];
      final sub = b.rawEvents.listen(events.add);
      final pushes = <Map<String, Object?>>[];
      final psub = b.watchPushPayloads().listen(pushes.add);
      final a = b.refreshQuote('apv_q')!;
      await Future<void>.delayed(Duration.zero);
      final up = events.singleWhere((e) => e['type'] == 'proposal.updated');
      final p = up['payload']! as Map;
      expect(p['rev'], a.rev);
      expect(p['min_out_raw'], isA<String>());
      expect(p['total_max_lamports'], isA<String>());
      expect(p['swap_fee_bps'], isA<int>());
      expect(pushes, isEmpty, reason: 'proposal.updated is silent (no push)');
      await sub.cancel();
      await psub.cancel();
      b.dispose();
    });
  });

  group('1.1.4 guard weakening via REST PATCH', () {
    test('classifier mirrors guard_weakened_fields (share_pct_max, lp_burned_pct_min, required_checks)', () {
      final old = {
        SettingsKeys.topHoldersSharePctMax.current: 30,
        SettingsKeys.lpBurnedPctMin.current: 90,
        SettingsKeys.requiredChecks.current: ['a', 'b'],
        SettingsKeys.mcapUsdMax.current: 1000000,
      };
      expect(MockBackend.guardWeakenedFields(old, {SettingsKeys.topHoldersSharePctMax.current: 25}), isEmpty);
      expect(MockBackend.guardWeakenedFields(old, {SettingsKeys.topHoldersSharePctMax.current: 35}), [
        SettingsKeys.topHoldersSharePctMax.current,
      ]);
      expect(MockBackend.guardWeakenedFields(old, {SettingsKeys.topHoldersSharePctMax.current: 0}), hasLength(1));
      expect(MockBackend.guardWeakenedFields(old, {SettingsKeys.lpBurnedPctMin.current: null}), hasLength(1));
      expect(
        MockBackend.guardWeakenedFields(old, {
          SettingsKeys.requiredChecks.current: ['a'],
        }),
        hasLength(1),
      );
      expect(
        MockBackend.guardWeakenedFields(old, {SettingsKeys.mcapUsdMax.current: 5000000}),
        isEmpty,
        reason: 'screener keys are not guards',
      );
    });

    test('tightening applies (rev+1); loosening → 202 proposal, nothing applied, approve needs hold proof', () async {
      final b = MockBackend();
      final s = b.debugStrategies.firstWhere((x) => x.id == 'stg_pullback');
      final key = SettingsKeys.topHoldersSharePctMax.current;
      final tight = await b.patchSettings(s.id, expectedRev: s.rev, settingsPatch: {key: 20});
      expect(tight, isA<StrategyPatchApplied>());
      expect((tight as StrategyPatchApplied).strategy.rev, s.rev + 1);
      expect(b.debugGuards(s.id)[key], 20);

      final loose = await b.patchSettings(s.id, expectedRev: s.rev + 1, settingsPatch: {key: 50});
      expect(loose, isA<StrategyPatchPendingApproval>());
      final pending = loose as StrategyPatchPendingApproval;
      expect(pending.weakenedFields, [key]);
      expect(pending.proposal.weakening, isTrue);
      expect(b.debugGuards(s.id)[key], 20, reason: '202: NOT applied');
      await expectLater(() => b.decide(decideRequest(pending.proposal, approve: true)), _api('CONFIRMATION_REQUIRED'));
      await expectLater(
        () => b.decide(decideRequest(pending.proposal, approve: true, holdMs: 800)),
        _api('HOLD_TOO_SHORT'),
      );
      await b.decide(decideRequest(pending.proposal, approve: true, holdMs: 1300));
      expect(b.debugGuards(s.id)[key], 50, reason: 'applied after approval');
      await expectLater(
        () => b.patchSettings(s.id, expectedRev: 1, settingsPatch: {key: 10}),
        _api('STRATEGY_REV_CONFLICT'),
      );
      b.dispose();
    });
  });

  group('1.1.4 market cap, exits, errors', () {
    test('MarketCap: lamports BigInt string, USD Decimal, as-of; nulls → unknown / dash', () {
      final m = MarketCap.fromJson({
        'market_cap_lamports': '1200000000000',
        'mcap_usd': '186000.5',
        'mcap_as_of': '2026-10-29T09:00:00Z',
      })!;
      expect(m.lamports, Lamports.parse('1200000000000'));
      expect(m.usd, Decimal.parse('186000.5'));
      expect(m.isKnown, isTrue);
      expect(MarketCap.fromJson(const {}), isNull, reason: 'unknown → "—"');
      expect(formatMcapSol(m.lamports, 'en'), '1.2K\u00A0SOL');
      expect(formatMcapUsd(Decimal.parse('1234567.89'), 'en'), '\$1.2M');
      expect(formatMcapUsd(Decimal.parse('1234567.89'), 'id'), '\$1,2\u00A0jt');
      expect(formatMcapUsd(null, 'en'), dash);
      expect(formatBps(25, 'en'), '0.25%');
      expect(formatBps(300, 'id'), '3%');
    });

    test('TimeExits: time_stop_s / stall_exit ranges and patch shape', () {
      final t = TimeExits.fromSettings({
        SettingsKeys.timeStopS.current: 3600,
        SettingsKeys.stallExit.current: {'window_s': 600, 'min_move_pct': 0.5},
      });
      expect(t.timeStopS, 3600);
      expect(t.stallWindowS, 600);
      expect(t.toPatch()[SettingsKeys.stallExit.current], {'window_s': 600, 'min_move_pct': 0.5});
      expect(TimeExits.fromSettings({SettingsKeys.timeStopS.current: 0}).timeStopS, isNull);
      expect(TimeExits.fromSettings({SettingsKeys.timeStopS.current: 604801}).timeStopS, isNull);
    });

    test('exit_reason: 14 wire values labelled; 1.1.4 stall ≠ v1.0 stall alias', () {
      final en = AppLocalizationsEn();
      expect(ExitReasons.all, hasLength(14));
      for (final r in ExitReasons.all) {
        expect(exitReasonLabel(en, r.current), isNot(r.current), reason: r.current);
      }
      expect(exitReasonLabel(en, 'stall'), en.exitReasonStall);
      expect(exitReasonLabel(en, 'max_hold'), en.exitReasonMaxHold);
      expect(exitReasonLabel(en, 'no_new_high'), en.exitReasonNoNewHigh);
    });

    test('errors.map.json parity + tones: GUARD_WEAKEN pending (not error), QUOTE stale warning', () {
      final map = jsonDecode(pinnedI18n('errors.map.json')) as Map;
      expect(errorL10nCodes.toSet(), (map['codes'] as Map).keys.toSet());
      final errs = jsonDecode(pinnedErrorsJson()) as Map;
      final wire = {for (final e in errs['codes'] as List) (e as Map)['code'] as String};
      // errors.json (Backend) can run ahead of errors.map.json (UX). Every mapped code must exist on the
      // wire; wire codes without i18n copy fall back to the errors.json catalog message (never the key).
      expect(wire.containsAll(errorL10nCodes), isTrue, reason: 'errors.map.json has a code errors.json lacks');
      final en = AppLocalizationsEn();
      final idL = AppLocalizationsId();
      for (final code in wire.difference(errorL10nCodes.toSet())) {
        final c = ApiErrorCode.fromWire(code);
        expect(c, isNot(ApiErrorCode.unknown), reason: code);
        expect(errorText(en, c), c.message('en'), reason: code);
        expect(errorText(idL, c), c.message('id'), reason: code);
      }
      expect(errorText(idL, ApiErrorCode.fromWire('LOGO_NOT_FOUND')), idL.errorCodeLogoNotFound); // i18n 0.4.10
      expect(
        errorText(idL, ApiErrorCode.fromWire('MODE_NOT_ALLOWED')),
        startsWith('Strategi ini belum disetujui untuk mode Real'),
      );
      expect(errorTone(ApiErrorCode.guardWeakenRequiresApproval), ErrorTone.pending);
      expect(errorTone(ApiErrorCode.quoteMissingOrStale), ErrorTone.warning);
      expect(errorTone(ApiErrorCode.versionConflict), ErrorTone.error);
      final id = AppLocalizationsId();
      expect(errorText(id, ApiErrorCode.guardWeakenRequiresApproval), startsWith('Perubahan menunggu approval'));
      expect(errorTitle(id, ApiErrorCode.guardWeakenRequiresApproval), id.guardWeakenPendingTitle);
      expect(errorCta(AppLocalizationsEn(), ApiErrorCode.quoteMissingOrStale), 'Refresh quote');
    });
  });

  testWidgets('LatestThrottle: first value now, then at most one trailing (latest) per window', (tester) async {
    final seen = <int>[];
    final th = LatestThrottle<int>(const Duration(seconds: 3), seen.add);
    th.add(1);
    th.add(2);
    th.add(3);
    expect(seen, [1]);
    await tester.pump(const Duration(seconds: 3));
    expect(seen, [1, 3], reason: 'trailing latest; opens a new cooldown');
    th.add(4);
    expect(seen, [1, 3]);
    await tester.pump(const Duration(seconds: 3));
    expect(seen, [1, 3, 4]);
    await tester.pump(const Duration(seconds: 3));
    th.add(5);
    expect(seen, [1, 3, 4, 5], reason: 'idle → immediate');
    th.dispose();
  });
}
