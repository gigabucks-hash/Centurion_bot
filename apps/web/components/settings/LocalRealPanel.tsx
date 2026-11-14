"use client";
import { useEffect, useState } from "react";
import { ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui";
import { Dialog } from "@/components/ui/client";
import { useT } from "@/lib/i18n/client";
import { phantomAdapter, WalletError } from "@/lib/auth/wallet";
import {
  diffKnobs,
  lamportsToSolInput,
  rpcUrlOk,
  solToLamports,
  type RealKnobs,
} from "@/lib/local/real-limits";

type Status = {
  enabled: boolean;
  wallet: string;
  rpcUrl: string;
  global: RealKnobs;
  realStrategies: string[];
};

const emptyKnobs = (): RealKnobs => ({
  tradeLamports: "50000000",
  dailyLamports: "500000000",
  capLamports: "2000000000",
  maxPositions: 3,
  slippageBps: 300,
  priorityFeeLamports: "0",
  tipLamports: "0",
  takeProfits: [{ gainPct: 100, sellPct: 100 }],
  stopLossPct: 25,
  trailPct: 20,
  maxHoldMinutes: 0,
  filters: {
    minMcapUsd: 0, maxMcapUsd: null, minLiquidityUsd: 0, minVolume24hUsd: 0,
    maxTop10Pct: 100, minHolders: 0, minAgeMinutes: 0, maxAgeMinutes: null,
    minLpBurnPct: 0, maxPoolSharePct: 100,
  },
});

type Draft = { trade: string; daily: string; cap: string; positions: string; slippage: string; stop: string; trail: string; hold: string };

function draftFrom(k: RealKnobs): Draft {
  return {
    trade: lamportsToSolInput(k.tradeLamports),
    daily: lamportsToSolInput(k.dailyLamports),
    cap: lamportsToSolInput(k.capLamports),
    positions: String(k.maxPositions),
    slippage: String(k.slippageBps / 100),
    stop: String(k.stopLossPct),
    trail: String(k.trailPct),
    hold: String(k.maxHoldMinutes),
  };
}

function knobsFrom(d: Draft, base: RealKnobs): RealKnobs | null {
  const trade = solToLamports(d.trade);
  const daily = solToLamports(d.daily);
  const cap = solToLamports(d.cap);
  if (!trade || !daily || !cap) return null;
  const n = (s: string) => Number(s);
  if ([d.positions, d.slippage, d.stop, d.trail, d.hold].some((s) => !Number.isFinite(n(s)))) return null;
  return {
    ...base,
    tradeLamports: trade,
    dailyLamports: daily,
    capLamports: cap,
    maxPositions: n(d.positions),
    slippageBps: Math.round(n(d.slippage) * 100),
    stopLossPct: n(d.stop),
    trailPct: n(d.trail),
    maxHoldMinutes: n(d.hold),
  };
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/local/real", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({})) as { data?: Status; error?: string; message?: string };
  if (!res.ok) throw new Error(json.error ?? "invalid");
  return json;
}

export function LocalRealPanel() {
  const t = useT();
  const [status, setStatus] = useState<Status | null>(null);
  const [wallet, setWallet] = useState("");
  const [rpc, setRpc] = useState("https://api.mainnet-beta.solana.com");
  const [strategies, setStrategies] = useState("");
  const [draft, setDraft] = useState<Draft>(draftFrom(emptyKnobs()));
  const [pending, setPending] = useState<{ knobs: RealKnobs; message: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/local/real").then((r) => r.json()).then((j: { data?: Status }) => {
      if (!j.data) return;
      setStatus(j.data);
      setWallet(j.data.wallet);
      setRpc(j.data.rpcUrl);
      setStrategies(j.data.realStrategies.join(", "));
      setDraft(draftFrom(j.data.global));
    }).catch(() => {});
  }, []);

  const current = status?.global ?? emptyKnobs();
  const errText = (code: string) => {
    if (code === "needs_signature") return t("localReal.needsSignature");
    if (code === "bad_signature") return t("localReal.badSignature");
    if (code === "wallet") return t("localReal.walletMismatch");
    if (code === "not_installed") return t("localReal.notInstalled");
    if (code === "rejected") return t("localReal.rejected");
    return t("localReal.check");
  };

  async function connect() {
    setErr(null);
    try {
      const { address } = await phantomAdapter().connect();
      setWallet(address);
    } catch (e) {
      setErr(errText(e instanceof WalletError ? (e.code === "not_installed" ? "not_installed" : "rejected") : "wallet"));
    }
  }

  async function enable() {
    setErr(null);
    setNote(null);
    if (!wallet.trim()) return setErr(t("localReal.walletMismatch"));
    setBusy(true);
    try {
      const preview = await post({ action: "enable-message", wallet: wallet.trim() });
      const message = (preview.data as unknown as { message?: string } | undefined)?.message;
      if (!message) throw new Error("invalid");
      const signature = await phantomAdapter().signMessage(message);
      const saved = await post({ action: "enable", wallet: wallet.trim(), signature });
      if (saved.data) {
        setStatus(saved.data);
        setNote(t("localReal.on"));
      }
    } catch (e) {
      setErr(errText(e instanceof WalletError ? "rejected" : e instanceof Error ? e.message : "invalid"));
    } finally {
      setBusy(false);
    }
  }

  async function save(signature: string | null, knobs: RealKnobs) {
    const saved = await post({ action: "apply", scope: "global", knobs, signature });
    if (saved.data) {
      setStatus(saved.data);
      setDraft(draftFrom(saved.data.global));
    }
  }

  async function onSave() {
    setErr(null);
    setNote(null);
    const next = knobsFrom(draft, current);
    if (!next) return setErr(t("localReal.check"));
    const diff = diffKnobs(current, next);
    if (diff.kind === "same") return setNote(t("localReal.noChange"));
    if (diff.kind === "loosen") {
      setBusy(true);
      try {
        const preview = await post({ action: "limits-message", scope: "global", knobs: next });
        const message = (preview.data as unknown as { message?: string } | undefined)?.message;
        if (!message) throw new Error("invalid");
        setPending({ knobs: next, message });
      } catch (e) {
        setErr(errText(e instanceof Error ? e.message : "invalid"));
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    try {
      await save(null, next);
      setNote(t("localReal.savedTight"));
    } catch (e) {
      setErr(errText(e instanceof Error ? e.message : "invalid"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmLoosen() {
    if (!pending) return;
    setBusy(true);
    setErr(null);
    try {
      const signature = await phantomAdapter().signMessage(pending.message);
      await save(signature, pending.knobs);
      setPending(null);
      setNote(t("localReal.savedLoose"));
    } catch (e) {
      setErr(errText(e instanceof WalletError ? "rejected" : e instanceof Error ? e.message : "bad_signature"));
    } finally {
      setBusy(false);
    }
  }

  async function saveRpc() {
    setErr(null);
    if (!rpcUrlOk(rpc.trim())) return setErr(t("localReal.rpcBad"));
    try {
      const saved = await post({ action: "rpc", rpcUrl: rpc.trim() });
      if (saved.data) setStatus(saved.data);
      setNote(t("localReal.rpcSaved"));
    } catch (e) {
      setErr(errText(e instanceof Error ? e.message : "invalid"));
    }
  }

  async function saveStrategies() {
    setErr(null);
    const ids = strategies.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    try {
      const saved = await post({ action: "strategies", ids });
      if (saved.data) setStatus(saved.data);
      setNote(t("localReal.savedTight"));
    } catch (e) {
      setErr(errText(e instanceof Error ? e.message : "invalid"));
    }
  }

  const field = (key: keyof Draft, label: string) => (
    <label key={key} className="block min-w-0 flex-1">
      <span className="text-caption text-text-secondary">{label}</span>
      <input value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} inputMode="decimal" className="num mt-1 h-10 w-full rounded-md border border-border-default bg-bg-sunken px-3 text-body" />
    </label>
  );

  return (
    <section data-testid="real-money" data-mode="real" className="rounded-lg border border-mode-real/50 bg-bg-surface p-4 lg:col-span-2" aria-labelledby="local-real-h">
      <h2 id="local-real-h" className="flex items-center gap-2 text-titleSm text-mode-real"><Wallet size={16} aria-hidden /> {t("localReal.title")}</h2>
      <p className="mt-2 text-body text-text-secondary">{t("localReal.body")}</p>
      <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-1 text-label" role="status">
        <ShieldCheck size={14} aria-hidden /> {status?.enabled ? t("localReal.on") : t("localReal.off")}
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="text-caption text-text-secondary">{t("localReal.wallet")}</span>
          <input value={wallet} onChange={(e) => setWallet(e.target.value.trim())} autoComplete="off" spellCheck={false} className="num mt-1 h-10 w-full rounded-md border border-border-default bg-bg-sunken px-3 text-body" />
        </label>
        <Button type="button" variant="secondary" onClick={connect}>{t("localReal.connect")}</Button>
        <Button type="button" variant="real" disabled={busy || status?.enabled} loading={busy} onClick={enable}>{status?.enabled ? t("localReal.enabled") : t("localReal.enable")}</Button>
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        {field("trade", t("localReal.trade"))}
        {field("daily", t("localReal.daily"))}
        {field("cap", t("localReal.cap"))}
        {field("positions", t("localReal.positions"))}
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-label text-text-secondary">{t("localReal.more")}</summary>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          {field("slippage", t("localReal.slippage"))}
          {field("stop", t("localReal.stop"))}
          {field("trail", t("localReal.trail"))}
          {field("hold", t("localReal.hold"))}
        </div>
      </details>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={busy || !status?.enabled} onClick={onSave}>{t("localReal.save")}</Button>
        {status?.enabled ? <Button type="button" variant="ghost" onClick={() => post({ action: "disable" }).then((s) => s.data && setStatus(s.data)).catch((e) => setErr(errText(e instanceof Error ? e.message : "invalid")))}>{t("localReal.disable")}</Button> : null}
      </div>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-0 flex-1">
          <span className="text-caption text-text-secondary">{t("localReal.rpc")}</span>
          <input value={rpc} onChange={(e) => setRpc(e.target.value)} className="num mt-1 h-10 w-full rounded-md border border-border-default bg-bg-sunken px-3 text-body" />
        </label>
        <Button type="button" variant="secondary" onClick={saveRpc}>{t("localReal.saveRpc")}</Button>
      </div>
      <label className="mt-3 block">
        <span className="text-caption text-text-secondary">{t("localReal.strategies")}</span>
        <input value={strategies} onChange={(e) => setStrategies(e.target.value)} className="num mt-1 h-10 w-full rounded-md border border-border-default bg-bg-sunken px-3 text-body" />
      </label>
      <Button type="button" className="mt-2" variant="secondary" disabled={!status?.enabled} onClick={saveStrategies}>{t("localReal.saveStrategies")}</Button>
      {note ? <p className="mt-3 text-caption text-semantic-profit" role="status">{note}</p> : null}
      {err ? <p className="mt-3 text-caption text-semantic-loss" role="alert">{err}</p> : null}
      <Dialog open={pending != null} onClose={() => setPending(null)} title={t("localReal.confirmTitle")} accent="real">
        <p className="text-body text-text-secondary">{t("localReal.confirmBody")}</p>
        <pre className="num mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-border-subtle bg-bg-sunken p-3 text-caption">{pending?.message}</pre>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="real" loading={busy} onClick={confirmLoosen}>{t("localReal.confirmSign")}</Button>
          <Button type="button" variant="ghost" onClick={() => setPending(null)}>{t("localReal.cancel")}</Button>
        </div>
      </Dialog>
    </section>
  );
}
