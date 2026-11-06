// BUG_HUNT_v2 — N2 (P2): a `loadMore()` page fetched for the previous range is merged into the
// new range's ledger.
//
// `PagedListController._load` (apps/mobile/lib/data/api/cursor_page.dart:82-100) has no
// generation/epoch guard: it merges whatever the awaited fetch returns into whatever `_state`
// is *now*. `PnlReportScreen._syncRange` (pnl_report_screen.dart:86-100) changes `_from`/`_to`
// and calls `refresh()` while a `loadMore()` may still be in flight, so:
//
//   refresh() -> page A (7d) ... loadMore(cursor A) pending
//   range tab 30d -> refresh() -> page B (30d) replaces the state
//   stale page A arrives -> its rows are appended to page B and its cursor becomes next_cursor
//
// Result: 7d rows appear inside the 30d ledger, and `Load more` then walks the OLD range's
// cursor. This test drives the real controller with a controllable fetcher and asserts the
// correct behaviour, so it FAILS while the bug is present (that failure is the evidence).
//
// Run from C:\cw\app\apps\mobile:
//   flutter test ..\..\docs\qa\repro\v2\mobile_paging_race_test.dart
import 'dart:async';

import 'package:centurion_mobile/data/api/cursor_page.dart';
import 'package:flutter_test/flutter_test.dart';

class Row {
  const Row(this.id);
  final String id;
}

void main() {
  test('N2: a page fetched for the old range is discarded after refresh()', () async {
    final calls = <String?>[];
    final pending = <Completer<CursorPage<Row>>>[];

    Future<CursorPage<Row>> fetch({String? cursor, int limit = defaultPageLimit}) {
      calls.add(cursor);
      final c = Completer<CursorPage<Row>>();
      pending.add(c);
      return c.future;
    }

    final ctrl = PagedListController<Row>(
      ({cursor, limit = defaultPageLimit}) => fetch(cursor: cursor, limit: limit),
      idOf: (r) => r.id,
    );

    // 1. First page of the 7d range.
    final first = ctrl.refresh();
    expect(calls, [null]);
    pending[0].complete(const CursorPage(items: [Row('r7d-1')], nextCursor: 'cursor-7d'));
    await first;
    expect(ctrl.state.items.map((r) => r.id), ['r7d-1']);

    // 2. The user scrolls: a second 7d page is requested and stays in flight.
    final more = ctrl.loadMore();
    expect(calls, [null, 'cursor-7d']);

    // 3. The user switches the range to 30d before that page arrives: _syncRange -> refresh().
    final second = ctrl.refresh();
    expect(calls, [null, 'cursor-7d', null]);
    pending[2].complete(const CursorPage(items: [Row('r30d-1')], nextCursor: 'cursor-30d'));
    await second;
    expect(ctrl.state.items.map((r) => r.id), ['r30d-1']);
    expect(ctrl.state.nextCursor, 'cursor-30d');

    // 4. The stale 7d page finally lands.
    pending[1].complete(
      const CursorPage(items: [Row('r7d-2'), Row('r7d-1')], nextCursor: 'cursor-7d-2'),
    );
    await more;

    // The 30d ledger must not contain 7d rows, and Load more must not walk the 7d cursor.
    final observed = {
      'items': ctrl.state.items.map((r) => r.id).toList(),
      'nextCursor': ctrl.state.nextCursor,
      'loading': ctrl.state.loading,
    };
    // Printed before the assertion so a failing run shows both leaks at once.
    // ignore: avoid_print
    print('after stale page: $observed');
    expect(
      observed,
      {'items': ['r30d-1'], 'nextCursor': 'cursor-30d', 'loading': false},
      reason: 'N2: the stale page leaked rows and next_cursor from the previous range',
    );
  });
}