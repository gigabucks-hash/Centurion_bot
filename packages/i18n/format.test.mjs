// node --test locales/format.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { formatSol, pnlSol, pnlPct, formatPct, formatLamports, pctToFractionBps, fractionBpsToPct, formatFractionBps } from './format.mjs';
const NB = '\u00A0';
test('T-15 exact zero PnL: 0.00, neutral, no arrow, no sign', () => {
  for (const z of [0, -0, '0', 0n]) {
    const r = pnlSol(z, 'en'); assert.equal(r.text, `0.00${NB}SOL`); assert.equal(r.tone, 'neutral'); assert.equal(r.arrow, ''); assert.equal(r.sign, '');
  }
  assert.equal(pnlSol(0, 'id', { paper: true }).text, `0,00${NB}paper SOL`);
  assert.equal(formatSol(0, 'en', { kind: 'pnl' }), `0.00${NB}SOL`);
  assert.deepEqual(pnlPct(0, 'id'), { text: '0,0%', tone: 'neutral', arrow: '', sign: '' });
  assert.equal(formatPct(-0, 'en', { signed: true }), '0.0%');
});
test('non-zero PnL is never shown as zero and tone matches text', () => {
  const t = pnlSol(0.0002, 'en'); assert.equal(t.text, `+0.0002${NB}SOL`); assert.equal(t.tone, 'profit'); assert.equal(t.arrow, '▲');
  const l = pnlSol('-1', 'id'); assert.equal(l.text, `\u2212<0,000001${NB}SOL`); assert.equal(l.tone, 'loss'); assert.equal(l.arrow, '▼');
  assert.equal(pnlSol(-0.066, 'en').text, `\u22120.066${NB}SOL`);
  assert.equal(pnlSol(2.506, 'id').text, `+2,51${NB}SOL`);
  assert.equal(pnlPct(0.0002, 'en').text, '+<0.1%'); assert.equal(pnlPct(-0.084, 'id').text, '\u22128,4%');
});
test('amounts unchanged', () => {
  assert.equal(formatSol(27.533, 'id', { paper: true }), `27,53${NB}paper SOL`);
  assert.equal(formatSol(0.24, 'en'), `0.24${NB}SOL`);
  assert.equal(formatLamports('250000000', 'id'), `0,25${NB}SOL`);
});
test('manual sell: percent UI ↔ fraction_bps wire', () => {
  assert.equal(pctToFractionBps(100), 10000); assert.equal(pctToFractionBps(50), 5000); assert.equal(pctToFractionBps('25'), 2500);
  assert.equal(pctToFractionBps(0.01), 1); assert.equal(pctToFractionBps(33.333), 3333);
  for (const bad of [0, 0.004, 100.01, -5, 'x']) assert.throws(() => pctToFractionBps(bad), RangeError);
  assert.equal(fractionBpsToPct(2500), 25);
  assert.equal(formatFractionBps(5000, 'en'), '50%'); assert.equal(formatFractionBps(3333, 'id'), '33,33%'); assert.equal(formatFractionBps(10000, 'id'), '100%');
});
// ---- Rev 4.6 (contracts 1.1.4): quote fields + market cap
import {
  DASH, formatLamportsOrDash, formatBps, formatRawQty, quoteState, formatMcapUsd, formatMcapSol, formatRelativeSeconds,
} from './format.mjs';
test('quote fields: missing → em dash, lamports strings via BigInt, bps → %', () => {
  for (const m of [null, undefined, '']) {
    assert.equal(formatLamportsOrDash(m, 'en'), DASH); assert.equal(formatBps(m, 'id'), DASH);
  }
  assert.equal(formatLamportsOrDash('5000', 'en'), `0.000005${NB}SOL`);
  assert.equal(formatLamportsOrDash('250000000', 'id', { paper: true }), `0,25${NB}paper SOL`);
  assert.equal(formatLamportsOrDash('0', 'en'), `0.00${NB}SOL`);
  assert.equal(formatBps(25, 'en'), '0.25%'); assert.equal(formatBps(50, 'id'), '0,5%');
  assert.equal(formatBps(100, 'en'), '1%'); assert.equal(formatBps(1500, 'id'), '15%');
  assert.equal(formatRawQty('123456789000', 6, 'en'), '123,456.79');
  assert.equal(formatRawQty('123456789000', 6, 'id'), '123.456,79');
  assert.equal(formatRawQty('1234', 6, 'en'), '0.001234'); assert.equal(formatRawQty('99', null, 'en'), DASH);
  assert.equal(formatRawQty(null, 6, 'en'), DASH);
});
test('quoteState: server clock, Real blocks, Practice never blocks', () => {
  const now = Date.parse('2026-10-29T08:42:10.000Z');
  const q = { quote_ts: '2026-10-29T08:42:05.000Z', quote_expires_at: '2026-10-29T08:42:20.000Z' };
  const real = (skew, quote = q) => quoteState(quote, skew, { mode: 'real', localNowMs: now });
  assert.deepEqual(real(0), { state: 'fresh', ageS: 5, expiresInS: 10, blocksApprove: false });
  // device clock 20 s behind the server → already stale
  assert.deepEqual(real(20000), { state: 'stale', ageS: 25, expiresInS: 0, blocksApprove: true });
  assert.equal(quoteState(q, 20000, { mode: 'practice', localNowMs: now }).blocksApprove, false);
  assert.deepEqual(real(0, {}), { state: 'missing', ageS: null, expiresInS: null, blocksApprove: true });
  assert.equal(quoteState(null, 0, { localNowMs: now }).blocksApprove, false);
  assert.equal(real(10000, { quote_expires_at: q.quote_expires_at }).state, 'stale'); // server now == exp → stale
  assert.equal(typeof formatRelativeSeconds(-5, 'id'), 'string');
});
test('market cap: compact USD / SOL, null → em dash', () => {
  assert.equal(formatMcapUsd('1234567.89', 'en'), '$1.2M'); assert.equal(formatMcapUsd(null, 'id'), DASH);
  assert.equal(formatMcapSol('8400000000000', 'en'), `8.4K${NB}SOL`); assert.equal(formatMcapSol(null, 'en'), DASH);
  assert.match(formatMcapUsd('1234567.89', 'id'), /^\$1,2\s?jt$/);
});
