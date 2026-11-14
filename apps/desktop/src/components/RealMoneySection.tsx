import { useEffect, useState } from "react";
import { core, runtime } from "../api";
import {
  DEFAULT_KNOBS,
  diffKnobs,
  fromWire,
  lamportsToSolInput,
  rpcUrlOk,
  solToLamports,
  toWire,
  type RealKnobs,
  type RealStatus,
} from "../real/limits";
import { useHotkeys } from "../hooks/useHotkeys";
import { useTerm } from "../state/store";

const empty = (): RealStatus => ({
  enabled: false,
  wallet: "",
  rpc_url: "https://api.mainnet-beta.solana.com",
  global: {
    trade_lamports: 50_000_000,
    daily_lamports: 500_000_000,
    cap_lamports: 2_000_000_000,
    max_positions: 3,
    slippage_bps: 300,
    priority_fee_lamports: 0,
    tip_lamports: 0,
    take_profits: [{ gain_pct: 100, sell_pct: 100 }],
    stop_loss_pct: 25,
    trail_pct: 20,
    max_hold_minutes: 0,
    filters: {
      min_mcap_usd: 0, max_mcap_usd: null, min_liquidity_usd: 0, min_volume_24h_usd: 0,
      max_top10_pct: 100, min_holders: 0, min_age_minutes: 0, max_age_minutes: null,
      min_lp_burn_pct: 0, max_pool_share_pct: 100,
    },
  },
  strategies: {},
  buys_paused: false,
  real_strategies: [],
});

function draftFrom(k: RealKnobs) {
  return {
    trade: lamportsToSolInput(k.tradeLamports),
    daily: lamportsToSolInput(k.dailyLamports),
    cap: lamportsToSolInput(k.capLamports),
    positions: String(k.maxPositions),
    slippage: String(k.slippageBps / 100),
    priority: k.priorityFeeLamports,
    percentile: String(k.priorityFeePercentile),
    jito: k.jitoEnabled ? "1" : "0",
    tip: lamportsToSolInput(k.tipLamports),
    stop: String(k.stopLossPct),
    trail: String(k.trailPct),
    hold: String(k.maxHoldMinutes),
    tpGain: String(k.takeProfits[0]?.gainPct ?? 100),
    tpSell: String(k.takeProfits[0]?.sellPct ?? 100),
    minMcap: String(k.filters.minMcapUsd),
    maxMcap: k.filters.maxMcapUsd == null ? "" : String(k.filters.maxMcapUsd),
    minLiq: String(k.filters.minLiquidityUsd),
    minVol: String(k.filters.minVolume24hUsd),
    top10: String(k.filters.maxTop10Pct),
    holders: String(k.filters.minHolders),
    minAge: String(k.filters.minAgeMinutes),
    maxAge: k.filters.maxAgeMinutes == null ? "" : String(k.filters.maxAgeMinutes),
    lpBurn: String(k.filters.minLpBurnPct),
    pool: String(k.filters.maxPoolSharePct),
  };
}

function knobsFrom(d: ReturnType<typeof draftFrom>, base: RealKnobs): RealKnobs | null {
  const trade = solToLamports(d.trade);
  const daily = solToLamports(d.daily);
  const cap = solToLamports(d.cap);
  const tip = solToLamports(d.tip);
  if (!trade || !daily || !cap || !tip) return null;
  const num = (s: string) => Number(s);
  if ([d.positions, d.stop, d.trail, d.hold, d.tpGain, d.tpSell, d.top10, d.holders, d.minAge, d.lpBurn, d.pool].some((s) => s !== "" && !Number.isFinite(num(s)))) return null;
  return {
    ...base,
    tradeLamports: trade,
    dailyLamports: daily,
    capLamports: cap,
    maxPositions: num(d.positions),
    slippageBps: Math.round(num(d.slippage) * 100),
    priorityFeeLamports: d.priority.replace(/\D/g, "") || "0",
    priorityFeePercentile: Math.round(num(d.percentile)),
    jitoEnabled: d.jito === "1",
    tipLamports: tip,
    stopLossPct: num(d.stop),
    trailPct: num(d.trail),
    maxHoldMinutes: num(d.hold),
    takeProfits: [{ gainPct: num(d.tpGain), sellPct: num(d.tpSell) }],
    filters: {
      ...base.filters,
      minMcapUsd: num(d.minMcap || "0"),
      maxMcapUsd: d.maxMcap.trim() ? num(d.maxMcap) : null,
      minLiquidityUsd: num(d.minLiq || "0"),
      minVolume24hUsd: num(d.minVol || "0"),
      maxTop10Pct: num(d.top10),
      minHolders: num(d.holders || "0"),
      minAgeMinutes: num(d.minAge || "0"),
      maxAgeMinutes: d.maxAge.trim() ? num(d.maxAge) : null,
      minLpBurnPct: num(d.lpBurn || "0"),
      maxPoolSharePct: num(d.pool),
    },
  };
}

/**
 * Real stays off until the owner signs. Limits are per strategy and global.
 * Tightening saves immediately. Loosening shows old versus new, then asks for a wallet signature.
 */
export function RealMoneySection() {
  const strategies = useTerm((s) => s.strategies);
  const setRealOn = useTerm((s) => s.setRealOn);
  const [status, setStatus] = useState<RealStatus | null>(null);
  const [scope, setScope] = useState("global");
  const [wallet, setWallet] = useState("");
  const [rpc, setRpc] = useState("https://api.mainnet-beta.solana.com");
  const [fastRpc, setFastRpc] = useState("");
  const [draft, setDraft] = useState(draftFrom(DEFAULT_KNOBS));
  const [pending, setPending] = useState<RealKnobs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const s = await core.realStatus().catch(() => empty());
    setStatus(s);
    setWallet(s.wallet);
    setRpc(s.rpc_url);
    setFastRpc(s.fast_rpc_url ?? "");
    setRealOn(s.enabled);
    const wire = scope === "global" ? s.global : s.strategies[scope] ?? s.global;
    setDraft(draftFrom(fromWire(wire)));
  };
  useEffect(() => { void load(); }, [scope]);

  const current = () => {
    if (!status) return DEFAULT_KNOBS;
    const wire = scope === "global" ? status.global : status.strategies[scope] ?? status.global;
    return fromWire(wire);
  };

  const save = async () => {
    setErr(null);
    setMsg(null);
    const next = knobsFrom(draft, current());
    if (!next) return setErr("Check the numbers. SOL can use up to 9 decimals. There is no maximum.");
    const diff = diffKnobs(current(), next);
    if (diff.kind === "same") return setMsg("No change.");
    if (diff.kind === "loosen") {
      setPending(next);
      return;
    }
    setBusy(true);
    try {
      const saved = await core.realApply(scope === "global" ? "global" : `strategy:${scope}`, toWire(next), null);
      setStatus(saved);
      setMsg("Tighter limits saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const confirmLoosen = async () => {
    if (!pending || !status) return;
    setBusy(true);
    setErr(null);
    try {
      const scopeId = scope === "global" ? "global" : `strategy:${scope}`;
      const wire = toWire(pending);
      if (runtime !== "tauri") {
        setErr("The installed Centurion Trade app opens your wallet to sign a looser limit. This preview will not store it.");
        return;
      }
      const message = await core.realLimitsMessage(scopeId, wire);
      const signature = await core.realSign("message", message);
      const saved = await core.realApply(scopeId, wire, signature);
      setStatus(saved);
      setPending(null);
      setMsg("Looser limits saved after the wallet signature.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const enable = async () => {
    setErr(null);
    if (!wallet.trim()) return setErr("Paste the wallet address that will sign.");
    if (runtime !== "tauri") {
      setErr("Real turns on in the installed app, after this wallet signs. The preview cannot enable mainnet trading.");
      return;
    }
    setBusy(true);
    try {
      const message = await core.realEnableMessage(wallet.trim());
      const signature = await core.realSign("message", message);
      const saved = await core.realEnable(wallet.trim(), signature);
      setStatus(saved);
      setRealOn(true);
      setMsg("Real is on. Buys still wait for your wallet to sign each swap.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveRpc = async () => {
    if (!rpcUrlOk(rpc)) return setErr("Use https://, or http://127.0.0.1 / localhost.");
    setErr(null);
    try {
      setStatus(await core.realSetRpc(rpc.trim()));
      setMsg("RPC saved on this PC.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const saveFast = async () => {
    if (fastRpc.trim() && !rpcUrlOk(fastRpc.trim())) return setErr("Use https://, or http://127.0.0.1 / localhost. Leave it empty to stay on the normal RPC.");
    setErr(null);
    try {
      setStatus(await core.realSetFastRpc(fastRpc.trim()));
      setMsg(fastRpc.trim() ? "Faster RPC saved on this PC." : "Faster RPC is off.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const toggleStrategy = async (id: string) => {
    if (!status) return;
    const has = status.real_strategies.includes(id);
    const ids = has ? status.real_strategies.filter((x) => x !== id) : [...status.real_strategies, id];
    setStatus(await core.realSetStrategies(ids));
  };

  const field = (key: keyof typeof draft, label: string) => (
    <label key={key}>
      <div className="muted">{label}</div>
      <input className="mono" value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </label>
  );

  const diff = pending ? diffKnobs(current(), pending) : null;

  return (
    <div className="settings-section" data-testid="real-money">
      <div className="muted">Real money</div>
      <p className="dim">
        Off until you sign with your own wallet. The app never sees the key. Defaults are 0.05 SOL per trade, 0.5 SOL per day, 2 SOL cap, 3 positions. You can set any higher number. A tighter limit saves now. A looser limit shows the old and new values, then asks the wallet to sign.
      </p>
      <div className="chip" role="status">{status?.enabled ? "Real on" : "Real off"}</div>
      <label>
        <div className="muted">Owner wallet</div>
        <input className="mono" value={wallet} onChange={(e) => setWallet(e.target.value.trim())} placeholder="Your Solana address" autoComplete="off" />
      </label>
      <div className="actions">
        <button className="primary" disabled={busy || status?.enabled} onClick={enable}>{status?.enabled ? "Real is on" : "Enable Real"}</button>
      </div>
      <label>
        <div className="muted">RPC URL</div>
        <input className="mono" value={rpc} onChange={(e) => setRpc(e.target.value.trim())} />
      </label>
      <button className="sm" onClick={saveRpc}>Save RPC</button>
      <label>
        <div className="muted">Faster RPC (optional, off when empty)</div>
        <input className="mono" value={fastRpc} onChange={(e) => setFastRpc(e.target.value.trim())} placeholder="Leave empty. A paid RPC is not required." />
      </label>
      <button className="sm" onClick={saveFast}>Save faster RPC</button>
      <label>
        <div className="muted">Edit limits for</div>
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="global">Global</option>
          {strategies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="real-grid">
        {field("trade", "SOL per trade")}
        {field("daily", "Daily max SOL")}
        {field("cap", "Capital cap SOL")}
        {field("positions", "Max open positions")}
        {field("slippage", "Slippage %")}
        {field("priority", "Priority fee cap (lamports, 0 = off)")}
        {field("percentile", "Priority fee percentile (0-100)")}
        {field("jito", "Jito tip (1 = on, 0 = off)")}
        {field("tip", "Tip SOL")}
        {field("tpGain", "Take-profit at +%")}
        {field("tpSell", "Take-profit sell %")}
        {field("stop", "Stop-loss % (0 = off)")}
        {field("trail", "Trailing stop % (0 = off)")}
        {field("hold", "Max hold minutes (0 = off)")}
        {field("minMcap", "Min market cap USD")}
        {field("maxMcap", "Max market cap USD")}
        {field("minLiq", "Min liquidity USD")}
        {field("minVol", "Min 24h volume USD")}
        {field("top10", "Max top-10 holders %")}
        {field("holders", "Min holders")}
        {field("minAge", "Min age minutes")}
        {field("maxAge", "Max age minutes")}
        {field("lpBurn", "Min LP burn %")}
        {field("pool", "Max pool share %")}
      </div>
      <button className="primary" disabled={busy} onClick={save}>Save limits</button>
      {status && strategies.length > 0 && (
        <div>
          <div className="muted">Strategies that trade Real</div>
          {strategies.map((s) => (
            <label key={s.id} className="toggle-row">
              <span>{s.name}</span>
              <input type="checkbox" checked={status.real_strategies.includes(s.id)} onChange={() => toggleStrategy(s.id)} />
            </label>
          ))}
        </div>
      )}
      {msg && <div className="dim" role="status">{msg}</div>}
      {err && <div className="neg" role="alert">{err}</div>}
      {pending && diff && (
        <LimitConfirm fields={diff.fields} busy={busy} onCancel={() => setPending(null)} onConfirm={confirmLoosen} />
      )}
    </div>
  );
}

function LimitConfirm({ fields, busy, onCancel, onConfirm }: {
  fields: { field: string; old: string; new: string; kind: string }[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useHotkeys({ escape: onCancel });
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="limit-title">
      <div className="modal limit-modal">
        <h3 id="limit-title">Loosen these limits?</h3>
        <p>This takes effect as soon as your wallet signs. Nothing here raises a hidden cap.</p>
        <table className="limit-diff">
          <thead><tr><th>Setting</th><th>Now</th><th>New</th></tr></thead>
          <tbody>
            {fields.filter((f) => f.old !== f.new).map((f) => (
              <tr key={f.field}>
                <td>{f.field}</td>
                <td className="num">{f.old}</td>
                <td className="num">{f.new}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="actions">
          <button autoFocus onClick={onCancel}>Cancel<kbd>Esc</kbd></button>
          <button className="danger" disabled={busy} onClick={onConfirm}>Sign and apply</button>
        </div>
      </div>
    </div>
  );
}
