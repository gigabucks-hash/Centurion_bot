/**
 * rAF batching for high-frequency realtime ticks (marks): keep only the latest value per key and flush at most
 * once per animation frame, so 50 marks/s cost one React render per frame, not 50.
 * `schedule` is injectable for tests (default requestAnimationFrame, setTimeout(16) outside the browser).
 */
export function createRafBatcher<K, V>(flush: (batch: Map<K, V>) => void, schedule: (cb: () => void) => unknown = defaultSchedule) {
  let pending = new Map<K, V>();
  let queued = false;
  const run = () => {
    queued = false;
    if (pending.size === 0) return;
    const b = pending;
    pending = new Map();
    flush(b);
  };
  return {
    push(key: K, value: V) {
      pending.set(key, value);
      if (!queued) {
        queued = true;
        schedule(run);
      }
    },
    /** Drop anything not yet flushed (unmount / mode switch). */
    cancel() {
      pending = new Map();
    },
  };
}

function defaultSchedule(cb: () => void) {
  return typeof requestAnimationFrame === "function" ? requestAnimationFrame(cb) : setTimeout(cb, 16);
}
