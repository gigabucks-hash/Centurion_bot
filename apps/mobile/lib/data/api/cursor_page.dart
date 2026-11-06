/// Keyset cursor paging (contracts 1.1.4, API_ENDPOINTS §3): `?cursor=&limit<=100`
/// (default 50), newest first by `(created_at, id)`; `next_cursor` is opaque and
/// `null` on the last page; a malformed cursor or one from another list →
/// `400 CURSOR_INVALID`. Clients never build or parse cursors.
library;

import 'api_exception.dart';

const defaultPageLimit = 50;
const maxPageLimit = 100;

class CursorPage<T> {
  const CursorPage({required this.items, required this.nextCursor});
  final List<T> items;

  /// Opaque; null = last page.
  final String? nextCursor;
  bool get hasMore => nextCursor != null;

  /// `{data: [...], next_cursor}` list envelope.
  static CursorPage<T> fromJson<T>(Map<String, Object?> j, T? Function(Map<String, Object?>) item) {
    final raw = (j['data'] as List?) ?? const [];
    return CursorPage(
      items: [
        for (final r in raw)
          if (r is Map) ?item(r.cast<String, Object?>()),
      ],
      nextCursor: j['next_cursor'] as String?,
    );
  }
}

typedef PageFetcher<T> = Future<CursorPage<T>> Function({String? cursor, int limit});

class PagedState<T> {
  const PagedState({this.items = const [], this.nextCursor, this.loading = false, this.done = false, this.error});
  final List<T> items;
  final String? nextCursor;
  final bool loading;
  final bool done;
  final Object? error;

  PagedState<T> copyWith({List<T>? items, String? nextCursor, bool? loading, bool? done, Object? error}) => PagedState(
    items: items ?? this.items,
    nextCursor: nextCursor,
    loading: loading ?? this.loading,
    done: done ?? this.done,
    error: error,
  );
}

/// Accumulates pages. On `CURSOR_INVALID` (e.g. the list was reset server-side)
/// it restarts from the first page once instead of surfacing an error.
///
/// Every request captures the controller's generation. `refresh()` bumps it, so a
/// `loadMore()` that was in flight for the previous range/filter can never append
/// its rows or its `next_cursor` to the new state (N2 paging race).
class PagedListController<T> {
  PagedListController(this._fetch, {required this.idOf, this.limit = defaultPageLimit, this.onChanged});
  final PageFetcher<T> _fetch;
  final String Function(T) idOf;
  final int limit;
  final void Function(PagedState<T>)? onChanged;

  PagedState<T> _state = PagedState<T>();
  PagedState<T> get state => _state;
  bool _disposed = false;
  int _generation = 0;

  bool _current(int generation) => !_disposed && generation == _generation;

  void _set(PagedState<T> s) {
    if (_disposed) return;
    _state = s;
    onChanged?.call(s);
  }

  Future<void> refresh() async {
    final generation = ++_generation;
    _set(PagedState<T>(loading: true));
    await _load(null, restartOnInvalid: false, generation: generation);
  }

  Future<void> loadMore() async {
    if (_state.loading || _state.done) return;
    final generation = _generation;
    _set(_state.copyWith(loading: true, nextCursor: _state.nextCursor));
    await _load(_state.nextCursor, restartOnInvalid: true, generation: generation);
  }

  Future<void> _load(String? cursor, {required bool restartOnInvalid, required int generation}) async {
    try {
      final page = await _fetch(cursor: cursor, limit: limit);
      if (!_current(generation)) return; // stale: range changed while in flight
      final seen = {for (final i in (cursor == null ? <T>[] : _state.items)) idOf(i)};
      final merged = [
        if (cursor != null) ..._state.items,
        for (final i in page.items)
          if (seen.add(idOf(i))) i,
      ];
      _set(PagedState(items: merged, nextCursor: page.nextCursor, done: !page.hasMore));
    } on ApiException catch (e) {
      if (!_current(generation)) return;
      if (restartOnInvalid && e.code == ApiErrorCode.cursorInvalid) {
        final retry = ++_generation;
        _set(PagedState<T>(loading: true));
        await _load(null, restartOnInvalid: false, generation: retry);
        return;
      }
      _set(_state.copyWith(loading: false, nextCursor: _state.nextCursor, error: e));
    }
  }

  /// Live head (Realtime/stream): new rows go in front, known ids are replaced in place.
  void mergeHead(List<T> fresh) {
    final byId = {for (final i in fresh) idOf(i): i};
    final rest = [
      for (final i in _state.items)
        if (!byId.containsKey(idOf(i))) i,
    ];
    _set(_state.copyWith(items: [...fresh, ...rest], nextCursor: _state.nextCursor));
  }

  void dispose() => _disposed = true;
}

/// Live head (stream, newest rows) + paged history: dedupe by id (head wins), sorted with [compare].
List<T> mergeHeadAndPages<T>(List<T> head, List<T> paged, String Function(T) idOf, int Function(T, T) compare) {
  final seen = <String>{};
  return [
    for (final x in [...head, ...paged])
      if (seen.add(idOf(x))) x,
  ]..sort(compare);
}

/// Load the next page when the list builds an item this close to the end.
const pagePrefetchDistance = 5;
