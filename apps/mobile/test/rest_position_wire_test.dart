// REST parity for `GET /v1/workspaces/{ws}/positions` (PositionWire, contracts
// 1.1.6 + migration 0022). The mock already feeds the UI; these tests pin the
// adapter that turns the real REST body into the same model.
import 'package:centurion_mobile/core/format.dart';
import 'package:centurion_mobile/core/l10n_format.dart';
import 'package:centurion_mobile/data/api/wire.dart';
import 'package:centurion_mobile/data/models/models.dart';
import 'package:centurion_mobile/data/mock/mock_backend.dart';
import 'package:flutter_test/flutter_test.dart';

/// A closed PositionWire exactly as `public.position_wire()` emits it (0022).
Map<String, Object?> closedWire() => {
  'id': '3f1c1c2e-9d1a-4f5e-8a7b-0c1d2e3f4a5b',
  'position_key': 'ws:GLOW:ck101.0',
  'workspace_id': '11111111-2222-4333-8444-555555555555',
  'strategy_id': 'stg_pullback',
  'mint': 'GLOWmint1111111111111111111111111111111111',
  'mode': 'practice',
  'status': 'closed',
  'rev': 7,
  'practice_epoch': 3,
  'qty_raw': '0',
  'decimals': 6,
  'token_program': 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'cost_basis_lamports': '0',
  'sol_in_lamports': '250000000',
  'sol_out_lamports': '312000000',
  'fees_lamports': '2500000',
  'avg_entry_price_sol': '0.0002',
  'peak_price_sol': '0.00029',
  'exit_price_sol': '0.00026',
  'exit_reason': 'tp_ladder_complete',
  'opened_at': '2026-11-06T02:00:00.000Z',
  'closed_at': '2026-11-06T03:00:00.000Z',
  'pnl_lamports': '62000000',
  'pnl_pct': '24.80',
  'hold_seconds': 3600,
  'logo_hash': 'abcDEF123_-x',
  'logo_url': '/v1/img/coin/GLOWmint1111111111111111111111111111111111?s=96&v=abcDEF123_-x',
};

void main() {
  group('Wire.positionOf', () {
    test('maps every closed PositionWire field from the REST body', () {
      final p = Wire.positionOf(closedWire());

      expect(p.id, '3f1c1c2e-9d1a-4f5e-8a7b-0c1d2e3f4a5b');
      expect(p.strategyId, 'stg_pullback');
      expect(p.mint, 'GLOWmint1111111111111111111111111111111111');
      expect(p.mode, TradeMode.practice);
      expect(p.state, PositionState.closed);
      expect(p.rev, 7);
      expect(p.practiceEpoch, 3);
      expect(p.decimals, 6);
      expect(p.tokenProgram, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      expect(p.qtyRaw, BigInt.zero);
      // sol_in_lamports is the original cost; the receipt learned in = out − pnl.
      expect(p.costLamports, Lamports.parse('250000000'));
      expect(p.proceedsLamports, Lamports.parse('312000000'));
      expect(p.feesLamports, Lamports.parse('2500000'));
      expect(p.entryPriceUsd, Decimal.parse('0.0002'));
      expect(p.markPriceUsd, Decimal.parse('0.0002'));
      expect(p.peakPriceUsd, Decimal.parse('0.00029'));
      expect(p.exitPriceUsd, Decimal.parse('0.00026'));
      expect(p.exitReason, 'tp_ladder_complete');
      expect(p.openedAt, DateTime.utc(2026, 11, 6, 2));
      expect(p.closedAt, DateTime.utc(2026, 11, 6, 3));
      expect(p.lockedPnlLamports, Lamports.parse('62000000'));
      expect(p.lockedPnlPct, 24.8);
      expect(p.holdSeconds, 3600);
      expect(p.soldBps, 10000);
      expect(p.logoHash, 'abcDEF123_-x');
      expect(p.logoUrl, contains('/v1/img/coin/'));
      // No symbol on PositionWire → short mint, never a guessed ticker.
      expect(p.symbol, 'GLOW…1111');
    });

    test('pnl/hold are server values: hold_seconds wins over the timestamps', () {
      final p = Wire.positionOf(closedWire());
      // closed_at − opened_at is 3600 s here; make them disagree to prove the
      // receipt uses hold_seconds and not the client clock.
      final skewed = Wire.positionOf({...closedWire(), 'hold_seconds': 1140});
      expect(skewed.holdAt(DateTime.utc(2030)), const Duration(seconds: 1140));
      expect(p.holdAt(DateTime.utc(2030)), const Duration(seconds: 3600));
      expect(p.pnlLamports, Lamports.parse('62000000'));
      expect(p.pnlPct, 24.8);
    });

    test('falls back to closed_at − opened_at only when hold_seconds is absent', () {
      final legacy = Map<String, Object?>.from(closedWire())..remove('hold_seconds');
      expect(legacy.containsKey('hold_seconds'), isFalse);
      final p = Wire.positionOf(legacy);
      expect(p.holdSeconds, isNull);
      expect(p.holdAt(DateTime.utc(2030)), const Duration(hours: 1));
    });

    test('open row: no locked pnl/hold, soldBps from cost_basis vs sol_in', () {
      final j = {
        ...closedWire(),
        'status': 'open',
        'sol_in_lamports': '250000000',
        'cost_basis_lamports': '150000000', // 40% already sold
        'sol_out_lamports': '0',
        'closed_at': null,
        'exit_reason': null,
        'exit_price_sol': null,
        'pnl_lamports': null,
        'pnl_pct': null,
        'hold_seconds': null,
      };
      final p = Wire.positionOf(j);
      expect(p.state, PositionState.open);
      expect(p.closedAt, isNull);
      expect(p.lockedPnlLamports, isNull);
      expect(p.lockedPnlPct, isNull);
      expect(p.holdSeconds, isNull);
      expect(p.soldBps, 4000);
      expect(p.remainingBps, 6000);
      expect(p.sizeLamports, Lamports.parse('150000000'));
    });

    test('strict: missing required money/time or unknown enums throws', () {
      expect(() => Wire.positionOf({...closedWire()}..remove('sol_in_lamports')), throwsFormatException);
      expect(() => Wire.positionOf({...closedWire()}..remove('opened_at')), throwsFormatException);
      expect(() => Wire.positionOf({...closedWire(), 'mode': 'paper'}), throwsFormatException);
      expect(() => Wire.positionOf({...closedWire(), 'status': 'archived'}), throwsFormatException);
    });

    test('tolerates a missing logo pair (identicon) and additive symbol', () {
      final j = Map<String, Object?>.from(closedWire())
        ..remove('logo_hash')
        ..remove('logo_url')
        ..['untrusted'] = {'symbol': 'GLOW'};
      final p = Wire.positionOf(j);
      expect(p.logoHash, isNull);
      expect(p.logoUrl, isNull);
      expect(p.symbol, 'GLOW');
    });
  });

  group('Wire.positionPageOf', () {
    test('reads the {items, next_cursor} list envelope', () {
      final page = Wire.positionPageOf({
        'items': [closedWire()],
        'next_cursor': 'opaque-cursor',
        'range_from': '2026-11-01T00:00:00Z',
        'range_to': '2026-11-07T00:00:00Z',
      });
      expect(page.items, hasLength(1));
      expect(page.items.single.id, '3f1c1c2e-9d1a-4f5e-8a7b-0c1d2e3f4a5b');
      expect(page.nextCursor, 'opaque-cursor');
      expect(page.hasMore, isTrue);
    });

    test('last page has a null cursor', () {
      final page = Wire.positionPageOf({'items': <Object?>[], 'next_cursor': null});
      expect(page.items, isEmpty);
      expect(page.nextCursor, isNull);
      expect(page.hasMore, isFalse);
    });
  });

  group('WIB (Asia/Jakarta, UTC+7)', () {
    test('03:00Z renders 10:00 WIB in both formatters', () {
      final wire = DateTime.parse('2026-11-06T03:00:00.000Z');
      expect(wire.isUtc, isTrue);
      expect(fmtTime(wire), '10:00');
      expect(formatTime(wire, 'id'), '10.00 WIB');
      expect(formatTime(wire, 'en'), '10:00\u00A0AM WIB');
    });

    test('the closed receipt time from the REST row is 10:00 WIB', () {
      final p = Wire.positionOf(closedWire());
      expect(fmtTime(p.closedAt!), '10:00');
      expect(fmtTime(p.openedAt), '09:00');
    });

    test('a device-local DateTime is converted by instant, not relabelled', () {
      // Whatever the machine zone, the same instant yields the same WIB time.
      final local = DateTime.parse('2026-11-06T03:00:00.000Z').toLocal();
      expect(fmtTime(local), '10:00');
      expect(formatTime(local, 'id'), '10.00 WIB');
    });

    test('the mock backend clock is a true UTC instant', () {
      final b = MockBackend();
      expect(b.serverNow.isUtc, isTrue);
      // Same instant as the real clock, just not device wall time.
      expect(b.serverNow.difference(DateTime.now().toUtc()).inMinutes.abs(), lessThan(1));
      b.dispose();
    });
  });
}
