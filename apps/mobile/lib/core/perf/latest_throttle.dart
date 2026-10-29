import 'dart:async';

/// Render at most once per [interval]: the first value renders at once and
/// opens a cooldown; values arriving during the cooldown collapse into one
/// trailing render of the LATEST value when it ends (which opens a new cooldown).
/// Used for quote refreshes (`proposal.updated`, server sends ≤ 1 per 3 s).
class LatestThrottle<T> {
  LatestThrottle(this.interval, this.onValue);
  final Duration interval;
  final void Function(T value) onValue;

  Timer? _cooldown;
  T? _pending;
  bool _hasPending = false;

  void add(T value) {
    if (_cooldown == null) {
      _emit(value);
      return;
    }
    _pending = value;
    _hasPending = true;
  }

  void _emit(T value) {
    onValue(value);
    _cooldown = Timer(interval, () {
      _cooldown = null;
      if (_hasPending) {
        _hasPending = false;
        _emit(_pending as T);
      }
    });
  }

  void dispose() {
    _cooldown?.cancel();
    _cooldown = null;
  }
}
