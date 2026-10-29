// node --test locales/format.test.mjs
import test from 'node:test'; import assert from 'node:assert/strict';
import { formatSol, pnlSol, pnlPct, formatPct, formatLamports } from './format.mjs';
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
