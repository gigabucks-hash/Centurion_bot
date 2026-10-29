# PROPOSAL: changes to TECH_DESIGN §16 (Phase 7 Real SOL) — not applied

**Status: PROPOSAL ONLY.** `TECH_DESIGN.md` is **not** edited and stays untouched until Boss approves Phase 7. When
approved, these changes are applied in one reviewed commit. Nothing here is built: no SDK installs, no signups, no
keys, no signing code, no transactions. Research basis: `REAL_MONEY_OPTIONS.md` (rev3).

Direction this implements: **relayed by Apex Dev Lead, 2026-10-29** — private single-owner app (Boss only); login is
wallet only (SIWS via Phantom), email/Telegram dropped from the MVP (code behind off flags); real money uses option C
with a delegated swap-only signer on a separate capped trading wallet Boss funds; Boss's main wallet is never
delegated; withdrawals are user-signed to Boss's main wallet only. Provider: Turnkey primary vs Crossmint, decided by a
bake-off that waits for Boss's explicit approval.

Notation: `-` = current §16 text (quoted or summarised), `+` = proposed text, **Why** = rationale.

---

## P1. §16 title and intro

```diff
- ## 16. Phase 7 roadmap: Real SOL sell RPC (design only)
+ ## 16. Phase 7 roadmap: Real SOL execution (design only)
- Status: design only. Nothing here is built. No signing code, no key handling, no transaction submission ...
+ Status: design only. Nothing here is built. (unchanged guarantees) Two signing paths:
+   (1) delegated: engine orders within policy limits, signed by a swap-only provider signer on the trading wallet;
+   (2) owner-signed: manual sells, over-limit orders, provider outages and all withdrawals, signed by Boss in Phantom.
```
**Why:** Boss chose C for automated trading; the user-signed sell path (today's whole §16) becomes path (2), not the
only path.

## P2. §16.1 Gating

```diff
  - Compiled only with the `live-execution` cargo feature ... (unchanged)
  - Runtime gate: workspace `real_trading` + global `REAL_TRADING_ENABLED` (unchanged)
+ - Fourth gate: an active, unexpired signer grant on the trading wallet whose live provider policy hash equals the
+   active `real_policies.body_hash`. Missing/expired -> `SIGNER_NOT_GRANTED`; mismatch -> `PROVIDER_POLICY_MISMATCH`
+   and the workspace kill switch trips.
+ - Owner gate: the request's SIWS identity is on `OWNER_WALLETS` (single-owner allowlist).
```
**Why:** delegated signing adds a credential and a remote policy that must both be in the expected state; the app is
single-owner.

## P3. §16.2 Who signs

```diff
- ### 16.2 Who signs: never the server
- - The server never holds, derives, receives or stores private keys or seed phrases. It builds an unsigned sell
-   transaction ... and returns it to the client.
+ ### 16.2 Who signs
+ - The server never holds, derives, receives or stores **wallet private keys, seed phrases or key shares**.
+ - Delegated path: the server may hold exactly one provider **authorization credential** (KMS/HSM-resident,
+   non-extractable, sign-request only). Its power is bounded by the provider policy (program allowlist, no
+   transfer-out, caps, expiry) and by our pre-sign checks (§16.11). It cannot export keys, change owners, add
+   signers or move funds to any address. For Crossmint this must be a Cloud KMS signer, not a raw server secret.
+ - Owner path: unchanged — Phantom (wallet-adapter / Mobile Wallet Adapter) signs; server byte-compares.
```
**Why:** C requires a server-side credential; the line we keep is "no wallet keys or shares", which still rules out
option B and delegated-share models.

## P4. §16.2 Wallet binding

```diff
- - Wallet binding: the selling wallet is linked to the user with SIWS ...; only linked wallets can be the fee payer
-   / token owner of a prepared transaction.
+ - Three wallet roles, never mixed:
+   * **Main wallet** (Boss's Phantom): SIWS login identity and the **only** withdraw destination. Never delegated,
+     never a provider wallet, never a `real_wallets` row.
+   * **Backup owner wallet** (hardware preferred): on `OWNER_WALLETS`; can log in and act as owner if the main
+     wallet is lost. Never delegated.
+   * **Trading wallet**: provider wallet owned by Boss's wallet credential (Turnkey wallet auth / Crossmint
+     external-wallet recovery), funded by Boss, balance-capped; the only wallet with a signer grant.
+ - `WALLET_ROLE_CONFLICT` extended: a trading wallet address can never be an owner/login address.
```
**Why:** isolates blast radius: a stolen signer reaches only the capped trading wallet; Boss's main funds are out of
reach by construction.

## P5. §16.3 RPC shape

```diff
- 1. prepare_real_sell(...) 2. confirmation 3. submit_real_sell(...)
+ Orders (`real_orders`) replace sell-only RPCs:
+ - Engine path: plan -> build -> presign check -> delegated sign -> submit -> track (idempotent on real_order_id).
+ - Owner path: prepare_real_order (sell or over-limit) -> owner confirmation -> submit_real_order (byte-compare).
+ - Withdraw: prepare_withdraw (destination fixed = main wallet; no destination parameter) -> owner confirmation ->
+   Boss signs as trading-wallet owner -> submit.
+ - All carry `presign_check_id`; errors added: KILL_SWITCH_ACTIVE, REAL_POLICY_DENIED, REAL_LIMIT_EXCEEDED,
+   PROGRAM_NOT_ALLOWED, DESTINATION_NOT_OWNED, SIMULATION_FAILED, SIMULATION_DELTA_MISMATCH, FEE_CAP_EXCEEDED,
+   SIGNER_NOT_GRANTED, SIGNER_REVOKED, SIGNER_UNAVAILABLE, PROVIDER_POLICY_MISMATCH, PROVIDER_POLICY_DENIED,
+   BLOCKHASH_EXPIRED, TX_NOT_LANDED, OWNER_NOT_ALLOWED, POLICY_LOOSEN_DELAYED.
```
**Why:** one order model for both paths keeps audit and idempotency uniform; a withdraw RPC with no destination
parameter makes "main wallet only" structural, not a check.

## P6. §16.4 Confirmation requirements

```diff
- ### 16.4 Confirmation requirements (all four, every real sell)
- - TOTP ... - Passkey ... - Typed name ... - Hold-to-confirm (press and hold ≥ 2 s)
+ ### 16.4 Confirmation (owner step-up)
+ - Factor 1 (always): a fresh **action-bound owner-wallet signature** (SIWS-format message with action, target,
+   payload_hash, nonce, expiry; domain/uri bound) from an `OWNER_WALLETS` address.
+ - Factor 2 (if enrolled; recommended): passkey (WebAuthn UV) or TOTP. Email OTP is not used (flag off).
+ - Typed name + hold **≥ 2,500 ms** (aligns with contracts §4.6, which already says 2,500).
+ - Required for: granting/renewing the signer, activating or loosening policy, clearing a kill switch, every
+   owner-path order, every withdrawal, changing OWNER_WALLETS. NOT required per delegated engine trade.
```
**Why:** with wallet-only login the wallet signature is the strongest factor we have and binds the exact action;
delegated trades must not prompt or auto-trading cannot work; §16.4's "2 s" contradicted contracts §4.6.

## P7. §16.5 Limits

```diff
- - Per-order cap, per-day count and notional cap ... raised only after a 24 h delay (audited).
- - Real sells only (no real buys) in the first Phase 7 increment.
+ - Limits become policy-as-data (`real_policies`, versioned, hash-pinned to the provider policy): per-trade cap,
+   daily cap, max open positions, trading-wallet max balance, slippage/price-impact caps, CU price/tip caps.
+ - Tighten = immediate; loosen = 24 h delay + owner step-up + auto-revert after 24 h unless re-confirmed.
+ - Rollout stages: 0 devnet; 1 sells-only (delegated exits on positions Boss opened by hand); 2 tiny buys
+   (screener-pick mints only); 3 raise limits after N clean days. Each stage = Boss sign-off.
```
**Why:** keeps the existing delay rule but makes limits enforceable in two places (provider + server) from one source.

## P8. §16.6 Audit

```diff
  (existing rows unchanged)
+ - Also: presign verdicts (rule hits, simulation digest), provider activity ids, policy activations and hash syncs,
+   signer grant/renew/revoke, kill-switch trips/clears (rule or owner), OWNER_WALLETS changes, every login attempt
+   by a non-allowlisted wallet.
```
**Why:** every new authority (signer, policy, allowlist) needs a trail.

## P9. §16.7 Before any code

```diff
  Threat model review, external security review of the prepare/verify path, devnet-only end-to-end with a
  hardware wallet, and written Boss/Apex sign-off.
+ Plus: Boss's explicit approval of vendor signup; Turnkey vs Crossmint devnet bake-off (provider policy alone must
+ reject a non-allowlisted program and any transfer-out); export-to-self-custody drill; signer-revocation drill.
- (legal review)                                   [not present today; NOT added: deprioritized for a private single-owner app]
```
**Why:** provider choice and the provider-side floor must be proven before code depends on them.

## P10. New §16.8 Kill switch

```diff
+ ### 16.8 Kill switch
+ Global (env + DB), workspace, strategy; checked before build and again right before sign. Hard stop also revokes
+ the provider signer grant. Auto-trip: loss velocity, failed-tx rate, any security-rule presign hit (immediate),
+ provider anomalies/policy-hash mismatch, data-quality (SOURCE_DEGRADED, ingest silence). Default on provider error:
+ "exits only" via the owner path. Clearing = owner step-up.
```
**Why:** fast containment that does not depend on our server being healthy (provider-side revoke).

## P11. New §16.9 Withdrawals

```diff
+ ### 16.9 Withdrawals
+ Our signer has no transfer permission. Withdrawals are owner-signed, from the trading wallet to the main wallet only
+ (fixed at bootstrap; no address book). Every withdrawal needs Boss's explicit re-confirmation (owner step-up).
+ Changing the main wallet or adding a backup owner wallet: 48 h minimum delay, cancellable, alerted (matches the
+ 2-day delay a comparable Solana trading bot is reported to use).
```
**Why:** implements the shared hard rule structurally.

## P12. New §16.10 Provider choice and exit plan

```diff
+ ### 16.10 Provider
+ Turnkey (primary) vs Crossmint, chosen by the approved bake-off. Policy-as-data lets us re-create the policy at the
+ other vendor; export-to-self-custody is drilled before Stage 1; owner path (Phantom) keeps exits possible during an
+ outage.
```
**Why:** lock-in and availability risks from `REAL_MONEY_OPTIONS.md` §9.

## P13. New §16.11 Pre-sign checks

```diff
+ ### 16.11 Pre-sign checks (every real tx, fail closed)
+ Kill switches -> intent binding (pick/position) -> instruction parse + program allowlist (pump.fun, PumpSwap,
+ Raydium, Jupiter + system/token/ATA/compute budget) -> account checks (fee payer = trading wallet; ATAs per the
+ mint's token_program) -> destination check (own ATAs; Jito tip accounts capped) -> amount caps -> independent
+ min-out / slippage / price impact -> fee and tip caps -> simulateTransaction balance-delta assertions -> rate
+ limits -> persisted verdict before the sign request.
```
**Why:** provider policies have documented gaps (Turnkey: top-level transfers only; Crossmint: transfer-only scopes),
so our checks are the swap-only guarantee with either vendor.

---

## Related changes outside §16 (listed for the same approval; also not applied)

- **§9 Auth:** login = SIWS via Phantom only, `OWNER_WALLETS` allowlist, sign-up disabled. Email OTP, Google/Apple
  and Telegram OIDC stay in code behind off-by-default flags (`AUTH_EMAIL_OTP_ENABLED=false`,
  `AUTH_OAUTH_ENABLED=false`, existing `AUTH_TELEGRAM_OIDC_ENABLED=false`). `LAST_LOGIN_METHOD` becomes "last owner
  wallet" (a backup owner wallet is required before the main one can be removed). Prefer the wallet-standard
  `solana:signIn` flow so Phantom builds and domain-checks the message.
- **§9 Sessions:** access token ≤ 15 min, rotating refresh bound to `device_id`, refresh-reuse revokes all sessions.
- **§10 Security model:** first bullet changes from "No private keys" to "No wallet private keys or key shares; one
  KMS-resident provider authorization credential in Phase 7 only".
- **Multi-tenant items** (roles beyond Owner, third-party account deletion, per-user custody): marked deprioritized,
  not removed.
