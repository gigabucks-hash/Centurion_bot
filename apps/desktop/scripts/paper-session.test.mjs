import assert from "node:assert/strict";
import test from "node:test";
import { openPaper, paperBuy, paperPnl, paperResume, paperSell, paperSellAll, paperStop } from "../src/paper/session.ts";

test("paper: buy, stop pauses new buys only, sell and jual semua still close", () => {
  let s = openPaper();
  const first = paperBuy(s, "MintA", "AAA");
  assert.equal(first.ok, true);
  s = first.state;
  assert.equal(s.positions.length, 1);
  assert.equal(s.buysPaused, false);

  s = paperStop(s);
  assert.equal(s.positions.length, 1, "stop does not sell");
  const blocked = paperBuy(s, "MintB", "BBB");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "BUYS_PAUSED");
  assert.equal(blocked.state.positions.length, 1);

  const sold = paperSell(s, s.positions[0].key, s.positions[0].valueLamports);
  assert.equal(sold.ok, true);
  assert.equal(sold.state.positions.length, 0);
  assert.equal(sold.state.buysPaused, true);
  assert.equal(sold.state.closed[0].pnlLamports, "0");

  s = paperResume(sold.state);
  s = paperBuy(s, "MintC", "CCC").state;
  s = paperBuy(s, "MintD", "DDD").state;
  assert.equal(s.positions.length, 2);
  s = paperStop(s);
  const all = paperSellAll(s);
  assert.equal(all.ok, true);
  assert.equal(all.state.positions.length, 0);
  assert.equal(all.state.closed.length, 3);
  assert.equal(all.state.buysPaused, true);
});

test("a missing pnl leg stays null so the screen can show an em dash", () => {
  let s = openPaper();
  s = paperBuy(s, "MintE", "EEE", null).state;
  const pnl = paperPnl(s);
  assert.equal(pnl.unrealized, null);
  assert.equal(pnl.realized, null);
  const closed = paperSell(s, s.positions[0].key, null);
  assert.equal(closed.state.closed[0].pnlLamports, null);
  assert.equal(closed.state.closed[0].solOut, null);
});
