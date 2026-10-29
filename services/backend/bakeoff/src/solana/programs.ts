// Program allowlist tables. Devnet and mainnet are kept SEPARATE on purpose.
// Every devnet ID was checked executable on devnet via getMultipleAccounts (2026-10-29, slot 516401829).
// Sources: docs/BAKEOFF_REVIEW.md §3.
import { createHash } from "node:crypto";

export const SYSTEM = "11111111111111111111111111111111";
export const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";
export const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const ATA = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const MEMO = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";
/** Memo v1: deployed, harmless, deliberately NOT allowlisted (used as the "non-allowlisted program" probe). */
export const MEMO_V1 = "Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo";

/** pump.fun: same IDs on mainnet and devnet (pump-public-docs). */
export const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";

/** Raydium: devnet IDs from raydium-sdk-V2 DEVNET_PROGRAM_ID; mainnet IDs from ALL_PROGRAM_ID. */
export const RAYDIUM_DEVNET = {
  AMM_V4: "DRaya7Kj3aMWQSy19kSjvmuwq9docCHofyP9kanQGaav",
  CPMM: "DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb",
  CLMM: "DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH",
} as const;
export const RAYDIUM_MAINNET = {
  AMM_V4: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
  CPMM: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
  CLMM: "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK",
} as const;
/** Jupiter v6: MAINNET ONLY. On devnet this address is a system-owned, non-executable account. */
export const JUPITER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

export const anchorDisc = (name: string): string =>
  createHash("sha256").update(`global:${name}`).digest().subarray(0, 8).toString("hex");

/** pump.fun discriminators, copied from pump-public-docs idl/pump.json (cross-checked with anchorDisc in tests). */
export const PUMP_IX: Record<string, { name: string; spendArgOffset?: number }> = {
  "66063d1201daebea": { name: "buy", spendArgOffset: 16 }, // amount u64, max_sol_cost u64
  "b817ee6167c5d33d": { name: "buy_v2", spendArgOffset: 16 },
  "07051dc4f5176550": { name: "buy_v3", spendArgOffset: 16 },
  "38fc74089edfcd5f": { name: "buy_exact_sol_in", spendArgOffset: 8 }, // spendable_sol_in u64
  "33e685a4017f83ad": { name: "sell" },
  "5df6823ce7e940b2": { name: "sell_v2" },
  "1c92de7726c469d5": { name: "sell_v3" },
};

export type ProgramEntry = { id: string; label: string; kind: "system" | "compute" | "token" | "ata" | "memo" | "pump" | "pump_amm" | "raydium_amm_v4" | "raydium_cpmm" | "raydium_clmm" | "jupiter" };

export function allowlistFor(cluster: "devnet" | "mainnet"): ProgramEntry[] {
  const base: ProgramEntry[] = [
    { id: SYSTEM, label: "System", kind: "system" },
    { id: COMPUTE_BUDGET, label: "Compute Budget", kind: "compute" },
    { id: TOKEN, label: "SPL Token", kind: "token" },
    { id: TOKEN_2022, label: "Token-2022", kind: "token" },
    { id: ATA, label: "Associated Token", kind: "ata" },
    { id: MEMO, label: "Memo v2", kind: "memo" },
    { id: PUMP, label: "pump.fun", kind: "pump" },
    { id: PUMP_AMM, label: "PumpSwap AMM", kind: "pump_amm" },
  ];
  const r = cluster === "devnet" ? RAYDIUM_DEVNET : RAYDIUM_MAINNET;
  base.push(
    { id: r.AMM_V4, label: "Raydium AMM v4", kind: "raydium_amm_v4" },
    { id: r.CPMM, label: "Raydium CPMM", kind: "raydium_cpmm" },
    { id: r.CLMM, label: "Raydium CLMM", kind: "raydium_clmm" },
  );
  if (cluster === "mainnet") base.push({ id: JUPITER_V6, label: "Jupiter v6", kind: "jupiter" });
  return base;
}

export const RAYDIUM_CPMM_IX = new Set([anchorDisc("swap_base_input"), anchorDisc("swap_base_output")]);
export const RAYDIUM_CLMM_IX = new Set([anchorDisc("swap"), anchorDisc("swap_v2")]);
/** raydium-amm instruction.rs tags: 9 SwapBaseIn, 11 SwapBaseOut, 16 SwapBaseInV2, 17 SwapBaseOutV2. */
export const RAYDIUM_AMM_V4_TAGS = new Set([9, 11, 16, 17]);
/** PumpSwap swaps (Anchor): buy / sell / buy_exact_quote_in. */
export const PUMP_AMM_IX = new Set([anchorDisc("buy"), anchorDisc("sell"), anchorDisc("buy_exact_quote_in")]);
