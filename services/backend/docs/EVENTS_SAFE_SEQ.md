# Events watermark and SSE resume (N1)

`public.events` is the outbox: publishers tail `seq > cursor` and a consumer must never
skip a row that commits later.

## The defect (BUG_HUNT_v2 N1)

`events_safe_seq()` used to return
`coalesce(min(seq) - 1 where xid >= pg_snapshot_xmin(...), max(seq), 0)`.
A snapshot cannot see an uncommitted row, so with a slow writer holding seq `X` and a fast
writer committing `X+1`, the minimum visible suspicious seq was `X+1` and the watermark
became `X` - the seq of the row that had not committed. `FeedHub` advanced its cursor to
that watermark on an empty page, so `X` was never delivered after it committed.

## The fix (migration `0024_events_safe_seq_committed.sql`)

1. `events_serialize_insert` (BEFORE INSERT) takes a transaction-scoped advisory lock and
   only then allocates `seq` from the identity sequence. The lock is held until commit, so
   a writer that receives `X` always commits before any writer receives a higher seq. An
   uncommitted seq is therefore always above the visible watermark, never below it.
   The identity default is consumed before the trigger runs and becomes a permanent gap;
   gaps are harmless because the watermark is `max(visible seq)`.
2. `events_safe_seq()` is `max(seq)` over the caller's statement snapshot: every seq it
   reports is committed and visible.
3. `FeedHub` no longer advances its cursor when a poll returns no rows. A cursor only
   moves over a row that was delivered. (The advisory lock already prevents the loss, but
   the consumer rule keeps resume correct if an older server runs the old watermark.)

The append-only triggers on `events` are untouched.

## Contract

- `events_safe_seq()` = highest committed `seq`; `0` when the table is empty.
- SSE event frames are ordered by `seq` and are only sent for `seq <= safe_seq`.
- `Last-Event-ID` / `after_seq` resume is `seq > cursor`; a gap caused by an aborted
  transaction is a permanent gap and needs no row.
- A client must not advance its own watermark past rows it has not received. Using
  `clock.safe_seq` as a watermark is only valid after draining `seq <= safe_seq`.

## Lock-ordering note

The advisory lock serializes event inserters globally. A transaction must not insert an
event while it waits on a row lock held by another transaction that is itself waiting to
insert an event; PostgreSQL would report a deadlock. Event inserts are the last write of
their transactions (worker/API), and the lock is held only until commit.

## Regression

`supabase/tests/97_sse_safe_seq.sql` uses two sessions (psql + dblink): the slow session
holds an uncommitted `X`, the fast writer must block instead of taking `X+1`, the
watermark stays below `X`, and after the commit a resume from the old watermark returns
both rows.