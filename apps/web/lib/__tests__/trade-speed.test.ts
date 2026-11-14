import assert from "node:assert/strict";
import test from "node:test";
import {
  CONFIRM_COMMITMENT,
  claimSell,
  cuLimitFromSim,
  jitoOn,
  predictBaseline,
  predictFast,
  priorityFeeLamports,
  releaseSell,
  rpcInUse,
  sellAllParallel,
  sendConfig,
  stageTotal,
} from "../local/trade-speed";

const measured = { quoteCold: 68, quoteWarm: 24, build: 45, sim: 80, send: 40, confirmPoll: 200, polls: 4, confirmWs: 50 };

test("priority fee stays inside the cap and the compute limit comes from the simulation", () => {
  assert.equal(priorityFeeLamports(100, 50_000, 1_000), 5);
  assert.equal(priorityFeeLamports(100, 50_000, 0), 0);
  assert.equal(cuLimitFromSim(50_000), 55_000);
  assert.notEqual(cuLimitFromSim(50_000), 200_000);
  assert.equal(jitoOn(false, 10_000), false);
  assert.equal(jitoOn(true, 0), false);
  assert.equal(rpcInUse("https://api.mainnet-beta.solana.com", ""), "https://api.mainnet-beta.solana.com");
  assert.equal(sendConfig(true).skipPreflight, true);
  assert.equal(sendConfig(false).skipPreflight, false);
  assert.equal(sendConfig(true).maxRetries, 0);
  assert.equal(CONFIRM_COMMITMENT, "confirmed");
});

test("the warm path is shorter than the serialized path, and a second sell is refused", async () => {
  const base = predictBaseline(measured);
  const fast = predictFast(measured, false);
  const cached = predictFast(measured, true);
  assert.ok(stageTotal(fast) < stageTotal(base));
  assert.ok(stageTotal(cached) < stageTotal(fast));
  assert.equal(claimSell("pos-a"), true);
  assert.equal(claimSell("pos-a"), false);
  releaseSell("pos-a");
  const started = Date.now();
  const seen: string[] = [];
  const out = await sellAllParallel(["a", "b", "a"], async (key) => {
    await new Promise((r) => setTimeout(r, 40));
    seen.push(key);
  });
  const elapsed = Date.now() - started;
  assert.deepEqual(out.sold.sort(), ["a", "b"]);
  assert.ok(elapsed < 90, `parallel sells took ${elapsed}ms`);
  assert.equal(seen.length, 2);
});
