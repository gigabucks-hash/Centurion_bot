# Sentra: Real-money trading options (design only, rev3: direction set)

rev3 (2026-10-29): records Boss's direction **as relayed by Apex Dev Lead, 2026-10-29** (§D): private single-owner
app, wallet-only login (SIWS via Phantom), option C with a delegated swap-only signer on a separate capped trading
wallet, withdrawals user-signed to Boss's main wallet only; shortlist now **Turnkey (primary) vs Crossmint**; threat
model revised for single-owner wallet login (§2.5); multi-tenant and legal items marked deprioritized (§8, §D.4).
The §16 changes are drafted as a proposal in `TECH_DESIGN_S16_PROPOSAL.md`; `TECH_DESIGN.md` itself is untouched.

rev2 (2026-10-29): folds in Apex's provider research (Page "Sentra — Real Money: Login & Wallet Options"):
shortlist Turnkey + Privy, **Crossmint as backup** (added to §1, §2, §6, §9); market evidence from a comparable
Solana trading bot and Axiom (§1.2); every vendor latency figure marked *vendor-claimed*; withdraw-delay check (§4.6);
explicit "§16 is a candidate to revise if Boss picks C" list (§7.9).

> **No signups, no developer accounts, no SDK installs, no API keys and no devnet spikes happen before Boss
> approves.** The Turnkey vs Crossmint bake-off and any vendor signup still wait for Boss's explicit approval.
> Everything below comes from public docs and Apex's research only.

---

## D. Decision direction (relayed by Apex Dev Lead, 2026-10-29)

This section supersedes the earlier "options" framing wherever they disagree. Sections 1–3 are kept as the record of
why C won.

### D.1 What Boss decided (as relayed)
1. **Private, single owner.** Sentra is Boss's own app. One owner (Boss); no other users, no sign-up, no teams.
2. **Login is wallet only:** SIWS with Phantom. Email OTP, Google/Apple and Telegram are **dropped from the MVP**;
   their code stays in the repo behind off-by-default flags (`AUTH_TELEGRAM_OIDC_ENABLED=false` already exists; email
   OTP and OAuth get the same treatment). Nothing is deleted.
3. **Real money = option C:** a delegated, **swap-only** signer on a **separate, capped trading wallet that Boss
   funds** himself.
4. **Boss's main wallet is never delegated.** No signer grant, no policy, no provider account ever touches it; it is
   only the login identity and the single withdraw destination.
5. **Withdrawals are user-signed, to Boss's main wallet only.** Our signer can never withdraw; there is no second
   destination.

### D.2 What stays exactly as designed
Program allowlist, per-trade and daily caps, **no transfer-out** for our signer, simulation before every sign
(§4.3), policy-as-data with versioning and audit (§4.5), kill switch at global / workspace / strategy plus signer
revocation and auto-trip (§5), staged rollout (§9.6). The shared hard rule is unchanged: no outbound transfer or
withdrawal of Boss's funds without Boss's explicit re-confirmation.

### D.3 Provider shortlist change: Turnkey (primary) vs Crossmint; Privy dropped
- **Why Privy drops out.** Privy's main advantage in Apex's research was native Telegram login [A1]. With wallet-only
  login that no longer applies. What remains weighs against it for this backend: its Rust SDK is alpha [A1], and its
  per-MAU pricing advantage means nothing for one user. Privy stays documented in §1 as a fallback only if both
  shortlisted vendors fail the bake-off.
- **Turnkey (primary).** Fits a wallet-login owner: Turnkey documents external-wallet (Phantom) authentication for
  its users / sub-organizations [W1][W2], so Boss's Phantom can be the trading wallet's owner credential. In-enclave
  Solana transaction parsing and program-level policy [T3][T4] can express "swap-only" at the provider, not just in our
  backend. Rust crate for our backend [A1]. Per-signature pricing [A1] is acceptable at one user but grows with trade
  count, so the bake-off must price it at expected trades/day. Signing latency is *vendor-claimed* ~50–100 ms / "sub-100ms" [A1][T2].
- **Crossmint (challenger).** Also fits a wallet-login owner: an external wallet can be the wallet's recovery
  method (the owner) [C3], with our operational signer added under it and revocable [C4]. But its documented scopes are
  **transfer-only** (token, spend limit, recipients, expiry) [C3], so swap-only would rest on our §4.3 checks, and a
  server operational signer under user recovery is "hybrid" custody by Crossmint's own definition [C1]. It is the
  pattern a comparable Solana trading bot is reported to use (swap-only trading key, 2-day delay on new withdraw
  addresses) [A1]; we could not verify from public docs how that bot enforces swap-only. No public latency figure.
- **Bake-off criteria (when approved):** can the provider policy alone reject a non-allowlisted program and any
  transfer-out (test on devnet with crafted txs)? p50/p95 sign latency from our region; owner = Boss's Phantom works
  end-to-end; revoke-signer time; cost at expected trades/day; export-to-self-custody drill.

### D.4 Deprioritized / out of scope for the MVP
Marked, not deleted, so they can come back if the app ever goes multi-user:
- Multi-tenant concerns: other users' onboarding, team roles beyond Owner, per-user custody classification, account
  deletion for third parties, cross-user abuse and rate-limit fairness.
- Legal and licensing work (OJK / POJK 27/2024, FinCEN, MiCA, app-store custody rules): **deprioritized**. A private
  tool used only by Boss with Boss's own funds is a different situation from offering trading to the public; §8 keeps
  the notes for the day that changes. Not legal advice.
- Email / Telegram / Google / Apple login flows and their threat rows (code stays behind off flags).

**Status: research and design only. Nothing here is built or approved.** No SDK is installed, no code signs or
touches keys, no private keys or key shares exist anywhere in this repo, and no transaction is ever sent. The
practice services keep refusing to start unless `TRADING_MODE=paper`; `LiveExecutor` stays a stub behind the
off-by-default `live-execution` feature; every `mode=real` request keeps returning `REAL_SOL_DISABLED` /
`MODE_NOT_ALLOWED`. Execution remains Phase 7 and needs Boss's written sign-off (TECH_DESIGN §16.7).

Shared hard rule carried into every option: **no outbound transfer or withdrawal of Boss's funds without explicit
re-confirmation by Boss.** In this design that rule is enforced in three places: the signer policy (provider), our
pre-sign checks (server), and the confirmation flow (client + server).

Date of research: 2026-10-29. Figures quoted from vendors are vendor claims, not our measurements. Anything
marked **(est.)** is our own estimate and must be replaced by a measured number from the Phase 7 devnet bench
(see `PERF_SECURITY.md`) before any limit or SLO depends on it.

Contents: 0 Summary · 1 Options · 2 STRIDE · 3 Latency · 4 Policy engine · 5 Kill switch · 6 Recovery and lifecycle ·
7 Server-side changes · 8 Regulatory notes · 9 Recommendation · 10 Open questions · 11 Sources

---

## 0. Summary

| | A. External wallet, user signs each trade | B. Custodial server key | C. Embedded non-custodial wallet + delegated policy signer |
|---|---|---|---|
| Who can move funds | User only | **Us** (and anyone who breaches us) | User; our signer only inside the policy |
| Auto-trade | No (human in the loop per tx) | Yes | Yes |
| Signal -> finalized (est.; C includes vendor-claimed signing) | ~3–30 s, dominated by the human | ~0.3–1.5 s | ~0.4–1.9 s |
| Worst case on server breach | Nothing signable | **Total loss of all user funds** | Losses bounded by policy + trading-wallet balance (not zero: see T3) |
| Regulatory posture | Non-custodial software | Custodian / money transmitter / CASP-like | Mostly non-custodial; depends on provider model and who holds which credential |
| Fits TECH_DESIGN §16 | Yes (it *is* §16) | **No** (violates §16.2) | Yes, with the §16.2 delta in §7.8 |

**Recommendation (details in §9; direction now set in §D): C for automated trading, with A kept as the path for manual sells, anything
above limits, and all fund movements; B rejected. Provider shortlist (rev3): Turnkey primary vs Crossmint; Privy dropped (§D.3).** C is accepted only with these conditions: a dedicated,
small-balance trading wallet; buys limited to mints our own screener picked; no transfer rule at all for our signer
(withdrawals are done by the user, not by us); our own pre-sign simulation on top of the provider policy; and a
staged rollout (sells-only, then tiny buys).

---

## 1. The three options

**A. External wallet login (Phantom, Solflare, Backpack, hardware via wallet-adapter / Mobile Wallet Adapter).**
SIWS links the wallet (already designed, TECH_DESIGN §9). For each trade the server prepares an unsigned
transaction, the user reviews and signs it in their wallet, and the signed bytes are submitted (§16.2–16.3).
Nothing can be signed while the user is away, so exits (stop loss, trailing) cannot fire unattended.

**B. Custodial: email/Telegram login, the server holds the wallet key (in KMS/HSM or worse).** Fastest because
signing is local. We become the custodian of every user's funds. A breach of the signing host, the KMS policy or the
deploy pipeline is a total loss. Directly contradicts §16.2 ("the server never holds, derives, receives or stores
private keys"). Listed for completeness only.

**C. Hybrid: any login + an embedded non-custodial wallet with delegated, policy-bound signing.** The wallet key is
generated and used inside a provider's TEE or split by MPC/secret sharing; the user is the owner. The user grants our
backend a *signer* (an authorization credential, not the wallet key) restricted by a policy enforced by the provider
before signing. Candidate providers and what their public docs say today:

| Provider | Model (per docs) | Delegated server signing for a *user-owned* wallet | Solana policy depth (per docs) | Published signing latency |
|---|---|---|---|---|
| **Privy** | 2-of-2 Shamir shares, key reconstructed only transiently inside an AWS Nitro Enclave [P1][P2] | Yes: "signers" / key quorums added by the user (`addSigners`, `delegateWallet`); requests can be required to be signed by our P-256 authorization key [P3][P4] | Program allowlists/denylists, recipient allow/deny, transfer limits, time-bound signers; default DENY; evaluated in the enclave [P5] | *Vendor-claimed:* Solana median 72.42 ms (Privy SLATE rerun, May 2026) [P6] |
| **Turnkey** | Keys generated and used in AWS Nitro Enclaves (QuorumOS), remote attestation [T1][T2] | Yes, via policies granting an API-key user (our backend) rights on the user's wallet; non-custodial if the end user holds the root authenticator [T2] | Enclave-side Solana parser: programs, accounts, signers, top-level SOL and SPL transfers, instruction data, IDL; `solana.tx` policy fields [T3][T4][T5] | *Vendor-claimed:* "sub-100ms" incl. ingress (whitepaper) [T2]; 50–100 ms on the vendor site (per Apex, not re-checked) [A1] |
| **Dynamic** | TSS-MPC; policies evaluated in a TEE [D2] | "Delegated access": **our server receives and stores an encrypted MPC key share** plus a per-wallet API key; Enterprise plan for production [D1] | Address, program, mint and token-account rules; resolves token accounts to owners; simulation before signing; policies are early access [D2] | Not found in public docs |
| **Para** | MPC | Guardrails cover **app-owned** wallets (REST / unclaimed pregenerated). For a user-owned wallet, server signing goes through user "Requests"/review links, not unattended [R1] | deny / require_approval rules, windowed spend limits; rules skipped on decode gaps in some cases [R1] | Not found in public docs |
| **Crossmint** (backup) | Smart wallet; custody is decided by the signer configuration: device/passkey signer + user email/phone recovery = non-custodial; **server signer + user recovery = "Hybrid: organization signs"** [C1][C2] | Yes: operational ("delegated") signers added to an existing wallet, approved by the wallet's recovery signer; revocable; signer-level `expiresAt` [C3][C4] | Scopes of type **`transfer` only**: per-token spending limit (optional interval), recipient whitelist, expiry; checked before broadcast and enforced on-chain by a policy contract [C3]. **No program/instruction allowlist found in public docs**, so "swap-only" cannot be expressed in scopes as documented | Not found in public docs |
| **Phantom (Connect embedded / Server SDK)** | Embedded wallet via Google/Apple sign-in [H2] | Embedded user wallets: only `signAndSendTransaction`, no `signTransaction`, from the client [H2]. The Server SDK signs **app-owned** wallets, is marked experimental and gated by partnership [H1] | Phantom simulation blocks known-malicious transactions [H2]; no developer policy engine found | Not found |

Reading of the table (our analysis, not vendor claims): Privy and Turnkey are the only two whose public docs show
unattended, policy-bound signing on a wallet the *user* owns, without us storing a key share, **and** with
program-level Solana policies. Crossmint can do unattended signing on a user-recoverable wallet, but (a) Crossmint's own
docs classify a server operational signer as *hybrid* custody, (b) its documented scopes limit transfers, not which
programs a swap may call, so our §4.3 checks would carry the whole swap restriction, and (c) a `server` signer is a
secret held in our infrastructure (a Cloud KMS signer with a non-extractable key is the documented alternative [C2]),
which needs the §16.2 wording in §7.8. Dynamic's delegated
access puts a key share on our servers (custody-adjacent; conflicts with the spirit of §16.2). Para's and Phantom's
server-side signing is for app-owned wallets, which is option B under another name.

### 1.1 Apex's provider input (from Apex's research Page [A1]; not re-verified unless cited)

| | Turnkey | Privy | Crossmint (backup) |
|---|---|---|---|
| Why shortlisted | TEE policy engine with in-enclave Solana parsing [T3][T4] | Native Telegram login (incl. Flutter, Mini App) [A1] | Swap-restricted trading key pattern reportedly used by a comparable Solana trading bot [A1] |
| Signing latency | *Vendor-claimed* ~50–100 ms (vendor site [A1]) / "sub-100ms" (whitepaper [T2]) | *Vendor-claimed* Solana median 72.42 ms [P6] | Not published |
| SDKs (per Apex) | Rust crate, Flutter SDK [A1] | Flutter SDK; Rust SDK **alpha** (`privy-rs` 0.1.0-alpha) [A1] | Flutter, Web; REST for server [A1] |
| Pricing (per Apex, rough) | Per signature (PAYG / Pro + per-sig) [A1]: cost scales with trade count | Per MAU tiers [A1] | Per monthly active wallet [A1] |
| Concerns | Telegram login only via Mini App pattern [A1] | Rust SDK alpha; OAuth account = wallet access, so MFA mandatory [A1] | Hybrid custody classification; transfer-only scopes (above) |

### 1.2 Market evidence (reported, not verified by us)
- **Axiom** (a public Solana trading terminal) is reported to use Turnkey for embedded non-custodial trading wallets
  [A1]. Reported only; we did not verify Axiom's integration.
- **A comparable Solana trading bot** is reported (via its published terms, per Apex) to use Crossmint wallets where
  the user holds recovery, the bot holds a **trading key limited to swaps**, withdrawals need user approval, and **new
  withdraw addresses wait 2 days** [A1]. We could not confirm from Crossmint's public docs how "swap-only" is enforced
  (the documented scopes are transfer-only [C3]); it may be enforced by the bot's own backend, which is exactly our
  §4.3 layer.
- What this supports: the shape of our design (user-owned wallet, restricted engine key, no engine withdrawals,
  delayed new addresses) is already in production use by comparable products. It does not prove any specific
  provider's policy is sufficient on its own.

---

## 2. STRIDE threat model

Assets: user SOL and tokens; signer credential (C) or wallet key (B); policy definitions; withdraw-address list;
kill-switch state; audit log; strategy settings (a loosened guard is a money risk).

### 2.1 Option A: external wallet, per-trade signing

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Phishing site / fake app asks the user to sign; SIWS replay | SIWS nonce 5 min single-use bound to domain+address (§9); wallet shows our domain; origin allow-list |
| T | Server (or MITM) swaps the prepared tx for a draining one; user signs blind | Byte-for-byte compare of signed message vs prepared (§16.3); human-readable summary from *our own* parse; wallet's own simulation; min-out encoded in the tx |
| R | User disputes a trade | Signature is the user's; audit row per prepare/confirm/submit (§16.6) |
| I | Wallet address links identity to holdings | Expected for public chains; don't log balances with PII |
| D | Wallet/extension down, user offline, blockhash expires (now ~30 s at 200 ms slots [S1]) | Re-prepare with fresh blockhash; exits are not guaranteed unattended (documented UX) |
| E | Malicious token/approval instruction slipped into a "sell" | Instruction allowlist in pre-sign checks (§4) before we even offer the tx; no `Approve`/`SetAuthority` ever |

Top mitigations: our pre-sign parser on the prepared tx; min-out in tx; byte-compare on submit.

### 2.2 Option B: custodial server key

| STRIDE | Threat | Mitigation (partial at best) |
|---|---|---|
| S | Stolen admin/CI credentials impersonate the signer service | HSM/KMS with per-call policy, MFA on deploy, separate account |
| T | Supply-chain / dependency compromise in the signer process rewrites txs | Reproducible builds, pinned deps, cargo-deny; **still total control once inside** |
| R | Insider moves funds and blames an attacker | Dual control, immutable logs off-box |
| I | Key exfiltration from memory, backups, logs, core dumps | HSM-resident keys; but KMS "sign" will still sign anything the compromised host asks [T2 §4] |
| D | Signer outage halts all trading and all withdrawals | HA signers; users cannot self-rescue funds |
| E | Any RCE on the API/worker = signing authority over all users | None that bounds loss. **Breach = total loss** |

Top issue: no mitigation bounds the loss to less than everything we hold. Rejected (§9).

### 2.3 Option C: embedded wallet + delegated policy signer

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | Attacker steals our signer authorization key (P-256 / API key) and requests signatures as us | Key in cloud KMS/HSM, never on disk; provider "require signed requests" [P4]; IP allow-list at provider if offered; short-lived signer validity; anomaly auto-trip (§5) |
| S | Account takeover of the user's login (email/Telegram/Google) -> attacker controls the *wallet owner* | Passkey + TOTP required for owner actions in our app; provider-side MFA on export/owner changes; withdraw-address 48 h delay (§4.6) |
| T | Compromised backend builds a tx that is "allowed" but extracts value (buy attacker's token, sandwich ourselves, route through attacker pool) | **Program allowlist is not enough.** Add: mint must be a screener pick with a server-signed decision record; min-out from an independent quote; slippage cap; per-trade and daily caps; pool/route allowlist; simulation balance-delta check (§4.3) |
| T | Policy edited to loosen limits (by insider or stolen provider admin) | Policy-as-data, versioned, hash pinned (§4.5); provider policy hash compared on every sign; loosen = 24 h delay + Boss re-confirmation; provider admin behind hardware MFA |
| R | "We didn't sign that" vs "the user did" | Provider activity log + our audit row with `presign_check_id`, policy version and tx signature |
| I | Leak of the trading wallet's positions/strategy | RLS; real stream separate (§16.6) |
| D | Provider outage or rate limit stops exits | Fallback: A (user signs exits manually); alert; no new entries while degraded (`SIGNER_UNAVAILABLE`) |
| D | Jito / RPC outage; tx not landing | Dual send paths (Jito block engine + a second sender), bounded retries within blockhash validity |
| E | Provider policy misses CPI-level transfers (e.g. Turnkey lists only *top-level* SOL/SPL transfers [T4]) | Our simulation checks *all* balance deltas, not just top-level instructions; deny unknown programs |
| E | TEE vulnerability / vendor insider | Bounded by trading-wallet balance; keep main funds in a separate wallet the signer has no grant on |

**Crossmint-specific rows (if the backup is used):**

| STRIDE | Threat | Mitigation |
|---|---|---|
| S/E | Our `server` operational-signer secret leaks: it is a signing secret in our infra, not a provider-held share [C2] | Use the Cloud KMS signer type (non-extractable key) instead of a raw secret [C2]; `expiresAt` short [C3]; revoke via remove-signer [C4] |
| T | Scopes are transfer-only [C3]: an allowed signer can call **any program** unless our backend stops it | §4.3 program/instruction allowlist and simulation become the *only* swap restriction; treat as a weaker floor than Turnkey/Privy |
| T | Transfer scope with no `recipients` allows **any recipient** [C3] | Always set `recipients` to the wallet itself / ATAs only; SOL spending limit per interval; never register a scope-less signer (scope-less = unrestricted [C3]) |
| E | Whoever controls the **recovery method** can authorize transactions and add/remove signers [C2] | Recovery must be the user's (passkey or email/phone with MFA), never our server; otherwise the wallet is hybrid/custodial by Crossmint's own definition |
| D | Spending-limit windows are enforced at slot level and drift [C3] (the doc still assumes ~400 ms slots; slots are 200 ms now [S1]) | Our own rolling counters (`real_limit_usage`) are authoritative; provider limit is a backstop |

### 2.5 Single-owner wallet-login threat model (rev3; applies to the chosen design)

With one owner, wallet-only login and no other users, the attack surface moves from "many accounts" to "Boss's wallet,
Boss's sessions and Boss's devices". Email/Telegram/OAuth rows above are out of scope while those flags are off.

| STRIDE | Threat | Mitigation |
|---|---|---|
| S | **Wallet-login phishing:** a look-alike site gets Boss to sign *its* SIWS message, or Boss signs ours on a fake origin | SIWS message binds `domain` and `uri`; Phantom rejects a recognised SIWS message whose `domain`/`uri` does not match the requesting page (error -32000, no prompt) [W3]; prefer the wallet-standard `solana:signIn` flow so the wallet builds and checks the message [W4]; server rejects any domain/URI mismatch; nonce 5 min, single use (TECH_DESIGN §9) [W5] |
| S/T | **Malicious sign-in message:** a "login" prompt that is really a transaction or an approval, or arbitrary bytes | The app only ever asks Boss's main wallet for (a) a SIWS message and (b) a withdraw transaction it displays in full; never `signMessage` on arbitrary/base64 bytes; never `signAllTransactions`; UI teaches "Sentra never asks you to sign anything at login except the sign-in text" |
| S/E | **Someone else's wallet logs in** | **Owner-wallet allowlist**: `OWNER_WALLETS` (public addresses, config, not secrets) checked in SIWS verify; sign-up disabled; any other address -> 403 and an alert; changing the allowlist = signed by an existing owner wallet + 48 h delay + audit |
| S | **Session theft** (stolen JWT/refresh token from a device, XSS, malware) | Short access token (≤15 min), rotating refresh bound to `device_id`, refresh reuse = revoke all sessions; httpOnly cookies on web; **step-up for every money action**: a fresh, action-bound owner-wallet signature over `payload_hash` (plus passkey/TOTP where enrolled) for granting the signer, loosening policy, clearing a kill switch, manual sells and withdrawals. A stolen session can view and can *tighten* or trip the kill switch, nothing more |
| T | Stolen session tries to change where funds go | There is no "where": the only withdraw destination is the main wallet, set at owner bootstrap; changing it = owner-allowlist change rules above |
| R | Boss disputes an action | Every money action carries the owner wallet's own signature (non-repudiable) plus the audit row |
| D | **Single point of failure: Boss's main wallet** is login + owner of the trading wallet + withdraw destination. Seed lost -> locked out; seed stolen -> attacker is Boss | Register a **backup owner wallet** (ideally hardware) on the allowlist at bootstrap; trading-wallet owner credential has a second factor at the provider (passkey) so one lost seed does not strand funds; kill switch can be tripped from any logged-in session; trading wallet stays small (cap), so a stolen seed's extra reach through Sentra is bounded by the cap. If the main wallet seed is stolen, the main wallet's funds are already at risk outside Sentra: Sentra must not make that worse (no new destinations, no loosening without delay) |
| D | Single point of failure: one provider, one RPC/sender, one operator | Manual (A) exits via Phantom; dual send paths; kill switch defaults to "exits only" on provider errors |
| E | Phantom extension/app compromise or malicious update | Hardware backup owner wallet; small trading cap; review prompts show the exact destination (main wallet) |

### 2.4 Top threats (ranked across the chosen design, C + A fallback)

1. **T1: Stolen signer credential** (Turnkey/Privy authorization key, or Crossmint server-signer secret) used to sign within policy. Bound: per-trade/daily caps, mint/route allowlist,
   trading-wallet balance cap, auto-trip on anomaly, instant provider-side revocation.
2. **T2: Value extraction through "allowed" trades** (buying attacker-controlled or illiquid tokens, self-sandwich,
   inflated priority fees or Jito tips). Bound: screener-pick mint binding, independent min-out, fee and tip caps,
   simulation balance-delta checks.
3. **T3: User account takeover** -> attacker adds a withdraw address or exports the key at the provider. Bound:
   passkey + TOTP, 48 h delay on new withdraw addresses, provider export protections, notifications on every channel.
4. **T4: Policy drift / silent loosening** (ours or the provider's copy). Bound: versioned policy-as-data, hash
   check per sign, loosen-only-with-delay, audit.
5. **T5: Provider outage during a drawdown** (exits can't fire). Bound: fallback to user-signed exits (A),
   halt new entries, alerting, small position sizes during rollout.

Rev3 re-ranking for the single-owner design (§2.5): T1 stolen signer credential, T2 value extraction via allowed
trades, **T3' wallet-login phishing / malicious signing prompts against Boss's main wallet**, **T4' session theft
(contained by action-bound wallet step-up)**, **T5' single point of failure on the main wallet (backup owner wallet)**.
Policy drift (old T4) and provider outage (old T5) stay as next in line.

---

## 3. Latency budget per option

Path: signal -> decision -> tx build -> sign -> send (priority fee / Jito) -> landed -> finalized.
Network facts as of 2026-10-29: slot time is **200 ms** on mainnet since 2026-10-09 [S1]; Alpenglow (Votor) is live
since 2026-10-21 and `confirmed` and `finalized` now describe the same state, finality ~150 ms after the block is
proposed (an expectation, not a constant) [S2]; blockhash validity is still 150 blocks, now ~30 s wall clock [S1].

| Step | A. User signs | B. Custodial | C. Delegated signer | Source / note |
|---|---|---|---|---|
| Signal (ingest -> screener) | same as practice | same | same | **(est.)** tens to a few hundred ms depending on provider/region; measure with our ingest-lag metric (TECH_DESIGN §11) |
| Decision (screener + guard, in-process Rust) | <20 ms (est.) | <20 ms (est.) | <20 ms (est.) | Our bench (`replay_budget_50k_samples`, PERF_SECURITY.md); to be confirmed |
| Tx build | 5–300 ms (est.) | same | same | Direct pump.fun/PumpSwap build from cached curve state is local (est. <5 ms); Jupiter/Raydium routing adds an API round trip (est. 50–300 ms) |
| Pre-sign checks + simulation | 50–200 ms (est.) | same | same | One `simulateTransaction` RPC round trip (est.); can run in parallel with provider enclave warm-up in C |
| Push to user + human review + sign | **2–20 s+ (est.)** | — | — | Human time; user may be away (then: never). Must finish inside the ~30 s blockhash window [S1] |
| Sign | wallet-local | <1 ms (est., local ed25519) | **~70–400 ms** | All *vendor-claimed* unless noted: Privy Solana median 72.42 ms [P6]; Turnkey "sub-100ms" [T2] / ~50–100 ms [A1]; *reported (third party)* Turnkey sign-tx median ~348 ms vs Privy ~245 ms [X1] (indicative only; reproducible probes at [T6]; region and date dependent). Crossmint, Dynamic, Para: no public figure |
| Send (to block engine / sender) | 10–100 ms (est.) | same | same | One network hop to a regional Jito block engine [J1] or Helius Sender [J3]; co-locate region |
| Landed (included in a block) | 1–5 slots = 200–1000 ms (est.) | same | same | 200 ms slots [S1]; Jito bundles only land on Jito-Solana leaders and need a competitive tip (min 1,000 lamports) [J1][J2] |
| Finalized | ~150 ms after the block (expectation) | same | same | Alpenglow [S2] |
| **Total, signal -> finalized** | **~3–30 s (est.)** | **~0.3–1.5 s (est.)** | **~0.4–1.9 s (est.)** | Sum of the above; human dominates A; C adds roughly one provider round trip over B |

Notes:
- C's extra cost over B is about one provider round trip (vendor-claimed / reported medians 72–350 ms; none measured by us). For memecoin entries this
  matters; for exits on a 15 s+ hold it usually does not. Vendor-integrated "quote+sign+send" APIs (Privy claims, *vendor-claimed*,
  ~190 ms end-to-end for its Solana swap API [P6]) are faster but move route building outside our pre-sign checks;
  **we do not use them** unless the provider policy alone can enforce our §4 rules.
- `skipPreflight`-style fast paths (Jito `sendTransaction` always skips preflight [J1]; Privy `optimistic_broadcast`
  [P6]) are acceptable only because we run our own simulation before signing.
- All "(est.)" rows are replaced by p50/p95 from the Phase 7 devnet bench before limits or SLOs are set.

---

## 4. Policy engine design

### 4.1 Layers (defence in depth; any layer can deny, none can allow alone)
1. **Strategy layer** (existing): screener + guard + exit plan decide *what* to trade (practice-proven).
2. **Sentra pre-sign checks** (new, in the real executor process, before any signing request): §4.3.
3. **Provider policy** (C only): enforced in the provider's enclave before signing, default DENY [P5][T4][D2].
4. **On-chain constraints** encoded in the tx: min-out / max-in, compute-unit price cap, recent blockhash.
5. **Kill switches** (§5) checked at the start and again right before the sign call.

### 4.2 Provider policy (C), the floor that holds even if our server is compromised
- Allowed programs only: pump.fun bonding curve, PumpSwap AMM, Raydium (named AMM/CPMM/CLMM programs), Jupiter
  aggregator, plus System, Compute Budget, Token, Token-2022, Associated Token. Program IDs pinned in the policy and
  verified against on-chain program accounts / published IDLs at policy-creation time (not copied from blogs).
- **No SOL or SPL transfer to any address** other than: the wallet's own ATAs, and the published Jito tip accounts
  (fetched via `getTipAccounts` [J2]) with a per-tx tip cap. Note: Turnkey's `solana.tx.transfers` /
  `spl_transfers` cover top-level instructions only [T4], so CPI movements are covered by §4.3, not the provider.
- Deny `Approve`, `SetAuthority`, `CloseAccount` to a non-owner destination, and any instruction on an unlisted
  program.
- Per-tx SOL-in cap and windowed daily cap where the provider supports spend windows (Para documents windowed
  limits [R1]; Privy documents transfer limits [P5]; Turnkey expresses value conditions in `solana.tx` [T3]).
- Signer validity time-bound (re-grant every N days by the user with passkey), where supported [P5].
- Key export and owner changes: never by our signer; user-only, provider MFA.

### 4.3 Sentra pre-sign checks (every real tx, in order; fail closed)
1. Kill switches off at global / workspace / strategy (§5); `real_trading` on; feature compiled in.
2. Intent binding: tx was built from a `real_order` row created by the engine from a screener pick
   (`pick_id`, `decision_hash`) or an exit plan step on an open real position. Buys require `mint` = pick mint.
3. Instruction-level parse (our own parser): every program in the allowlist; every instruction kind in an
   allowed set per program (buy/sell/swap/create-ATA/compute-budget); no unknown discriminators.
4. Account checks: fee payer = trading wallet; token accounts = ATA(trading wallet, mint, token_program) where the
   program is the mint's actual `token_program` (we already read it, contracts 1.1.2); pool/curve accounts match
   the pool we quoted.
5. Destination check: all outputs land in the trading wallet or its ATAs; the only permitted foreign SOL recipients
   are a Jito tip account (cap) and protocol fee accounts the program itself requires.
6. Amount limits: SOL in <= per-trade cap; rolling 24 h notional <= daily cap; open positions <= max; % of wallet.
7. Price/slippage: min-out derived from an independent quote (our pool read) with slippage <= cap bps; price impact
   <= cap; refuse stale pools (`POOL_STALE`) and non-SOL quote mints (`UNSUPPORTED_QUOTE_MINT`).
8. Fees: compute-unit price and limit <= caps; tip <= cap; total fee <= x bps of notional.
9. **Simulation preflight**: `simulateTransaction` with account snapshots; assert balance deltas: only the trading
   wallet's SOL decreases (by <= amount + fees + tip), only the expected mint's balance in its ATA increases (buy) or
   SOL increases (sell); no owner/authority/delegate change on any of our accounts; no new accounts owned by others
   funded from us beyond rent for our ATA.
10. Rate limits: per wallet tx/min, per strategy entries/hour, failed-tx budget.
11. Verdict persisted (`presign_checks` row with rule hits and simulation digest) **before** the sign request; the
    sign request carries `presign_check_id` in our audit, and the provider request is idempotency-keyed by
    `real_order_id`.

### 4.4 Option A specifics
Same checks 1–9 run when *preparing* the unsigned tx; the user's wallet signs; on submit we byte-compare (§16.3).

### 4.5 Policy-as-data
- Table `real_policies(id, workspace_id, version int, status draft|active|retired, body jsonb, body_hash,
  provider, provider_policy_id, provider_policy_hash, created_by, created_at, activates_at, rev)`.
- `body` (snake_case, same wire conventions: lamports as integer strings, bps as numbers):
  `{ schema: "real_policy/1", programs: [{id, label, allowed_ix: [...]}], tip_accounts_source: "jito_getTipAccounts",
  max_tip_lamports, max_cu_price_micro_lamports, max_cu_limit, per_trade_max_lamports, daily_max_lamports,
  max_open_positions, max_slippage_bps, max_price_impact_bps, buys_enabled: bool, sells_enabled: bool,
  mints_from: "screener_picks", rate_limits: {tx_per_min, entries_per_hour, failed_tx_per_15m},
  auto_trip: {...}, signer_ttl_days }`.
- Versioning: a new version is a new row; tightening activates immediately; **loosening activates after 24 h** and
  needs Owner passkey + TOTP + typed name + 2,500 ms hold (contracts §4.6) and, for Boss's workspace, Boss's explicit
  re-confirmation. Loosening auto-reverts after 24 h unless re-confirmed (mirrors the Real guard rule).
- Sync: on activate, the provider policy is written from `body` and its hash stored; every sign compares the live
  provider policy hash (cached, refreshed on webhook/poll) to `provider_policy_hash` -> mismatch trips the workspace
  kill switch (`PROVIDER_POLICY_MISMATCH`).
- Audit: every create/activate/retire/sync/mismatch is an append-only `audit_log` row with `body_hash`.

### 4.6 Withdrawals (the hard rule; rev3 single-destination)
- Our signer has **no transfer permission at all**. A withdrawal is initiated by Boss in the app and **signed by Boss**
  as the trading wallet's owner (Boss's Phantom via the provider's owner credential), never by our delegated signer.
- **One destination only: Boss's main wallet**, fixed at owner bootstrap. There is no address book. The app builds the
  withdraw tx to that address, Boss reviews it in Phantom, and every withdrawal still requires Boss's explicit
  re-confirmation at that moment (action-bound wallet signature, §2.5).
- **Delay rule:** with a single fixed destination, the "new withdraw address" delay applies to **changing the main
  wallet or adding a backup owner wallet**: 48 h minimum, cancellable, alerted. 48 h equals the 2-day delay a
  comparable Solana trading bot is reported to use [A1], so it matches; it stays a minimum (longer allowed, never
  shorter).

---

## 5. Kill switch

Scopes (all must be "on" to trade; checked before build and again immediately before sign):

| Scope | Who flips it | Effect |
|---|---|---|
| Global `REAL_TRADING_ENABLED` (env) + `real_global_halt` (DB) | Ops / Boss; auto rules | No new real orders anywhere; in-flight orders not yet signed are cancelled |
| Workspace `real_trading` | Owner; auto rules | Same, per workspace; optionally "exits only" mode |
| Strategy `real_enabled` | Owner/Admin; auto rules | Strategy stops entering; exits continue unless "freeze" |

- **Revocation at the provider** (C): a "hard stop" also revokes our signer grant through the provider's signer
  management (Privy signers / key quorums [P3][P4]; Turnkey policy or API-key deletion [T3]; Dynamic
  `wallet.delegation.revoked` flow [D1]). After revocation even a compromised backend cannot sign. Re-granting needs the
  user (passkey) — by design.
- **Auto-trip conditions** (thresholds are policy data, defaults for Boss to set):
  - Loss velocity: realized + marked loss > X% of trading-wallet value within 15 min, or > Y% in 24 h.
  - Error rate: > N failed/reverted/expired txs in 15 min; simulation-vs-landed balance divergence on any tx.
  - **Any** pre-sign security-rule hit (unknown program, foreign destination, authority change, policy hash
    mismatch) trips the workspace immediately and pages Ops; this indicates a bug or a compromise.
  - Provider anomaly: sign latency p95 > budget for 5 min, unexpected policy denials, unknown signer activity in
    the provider's activity log.
  - Data quality: `SOURCE_DEGRADED`, ingest silence > 60 s, server clock skew, quote divergence between sources.
- Clearing a trip: Owner passkey + TOTP; for security-rule trips also a written incident note; every trip/clear is an
  event and an audit row.

---

## 6. Key recovery and account lifecycle

| | A | B | C |
|---|---|---|---|
| Key holder | User's wallet (seed phrase / hardware) | Us | Provider TEE/MPC; user owns via login + MFA |
| Recovery | User's own seed; we can't help | Ours (and so is the liability) | Provider's recovery (login re-auth, passkey, recovery share) [P1][T2]; user can **export** the key to self-custody |
| Lost login | Unaffected (wallet is separate) | We reset | Provider account recovery; our app requires passkey re-enrol + TOTP |
| Device lost | Wallet-specific | N/A | Revoke device; signer grant unaffected (server-side); review notifications |
| Provider exit / lock-in | N/A | N/A | Export-to-self-custody path documented and tested on devnet before launch; policy-as-data lets us re-create policy at another provider |
| Account deletion (§9 TECH_DESIGN) | Unlink wallet; nothing to destroy | Must return funds first | Blocked while real positions or balance > dust (`ACCOUNT_DELETION_BLOCKED`); revoke signer; user exports or withdraws; then normal 7–30 day grace |
| Signer rotation | N/A | Key rotation = fund move | Rotate our authorization key in KMS and re-register the key quorum; old one revoked; no fund move |
| Crossmint (backup) | — | — | Recovery = user's passkey or email/phone OTP (must stay user-controlled [C2]); signer rotation = remove + re-add operational signer, approved by the user's recovery method [C3][C4] |

---

## 7. Server-side changes (list only; no code)

### 7.1 Tables (new; all `mode='real'` scoped, RLS = membership AND `mode_visible`)
- `real_wallets` (workspace, provider, provider_wallet_id, address, role `trading`, status, created_at; no secrets)
- `signer_grants` (wallet, provider_signer_id, policy_id+version, granted_at, expires_at, revoked_at, revoked_reason)
- `real_policies` (§4.5), `real_policy_syncs` (provider hash snapshots)
- `withdraw_addresses` (user, address, label, added_at, usable_at = +48 h, cancelled_at, proof_hash)
- `kill_switches` (scope global|workspace|strategy, target, state, reason, tripped_by user|rule, rule_id, at)
- `real_orders` (intent: pick_id/position_id, side, mint, amount, min_out, policy version, status, rev)
- `real_tx_attempts` (order, signature, blockhash, last_valid_block_height, cu_price, tip, path jito|sender|rpc,
  status sent|landed|finalized|expired|failed, error)
- `presign_checks` (order, verdict, rule hits, simulation digest, duration_ms)
- `real_limit_usage` (rolling counters per wallet/strategy/day)

### 7.2 Endpoints / RPCs (proposed; all need `trade:real`, never minted before Phase 7)
- `POST /real/wallets` (start provider onboarding), `GET /real/wallets`
- `POST /real/signer-grants` (user grants signer; passkey), `DELETE /real/signer-grants/{id}` (revoke)
- `GET/POST /real/policies`, `POST /real/policies/{id}/activate` (loosen = delayed + confirmation)
- `GET/POST /real/withdraw-addresses`, `DELETE ...` (cancel during delay)
- `POST /real/kill-switches/{scope}` (trip/clear), `GET /real/kill-switches`
- `GET /real/orders`, `GET /real/orders/{id}` (attempts, presign verdict)
- Existing §16.3 `prepare_real_sell` / `submit_real_sell` stay as the option-A path.

### 7.3 Error codes (add to `errors.json`; reuse `MODE_NOT_ALLOWED`, `REAL_SOL_DISABLED`, `SLIPPAGE_EXCEEDED`, `POOL_STALE`, `UNSUPPORTED_QUOTE_MINT`)
`KILL_SWITCH_ACTIVE`, `REAL_POLICY_DENIED`, `REAL_LIMIT_EXCEEDED`, `PROGRAM_NOT_ALLOWED`, `DESTINATION_NOT_OWNED`,
`SIMULATION_FAILED`, `SIMULATION_DELTA_MISMATCH`, `FEE_CAP_EXCEEDED`, `SIGNER_NOT_GRANTED`, `SIGNER_REVOKED`,
`SIGNER_UNAVAILABLE`, `PROVIDER_POLICY_MISMATCH`, `PROVIDER_POLICY_DENIED`, `BLOCKHASH_EXPIRED`, `TX_NOT_LANDED`,
`WITHDRAW_ADDRESS_PENDING`, `WITHDRAW_ADDRESS_UNKNOWN`, `POLICY_LOOSEN_DELAYED`.

### 7.4 Events (real stream only, never mixed with practice)
`real.order.created|signed|sent|landed|finalized|failed|expired`, `real.presign.denied`,
`real.kill_switch.tripped|cleared`, `real.signer.granted|revoked`, `real.policy.activated|mismatch`,
`real.withdraw_address.added|usable|cancelled`. Push: informational only; Real is never actionable from a push (§9).

### 7.5 Executor interface (description)
A separate, separately deployed `real-executor` process (never the practice services) behind `live-execution`.
Stages as distinct steps, each idempotent on `real_order_id`: `plan(intent) -> order`, `build(order) -> unsigned tx`,
`check(unsigned) -> verdict` (§4.3), `sign(unsigned, grant) -> signed` (provider call in C; returns
"user-signature-required" in A; not implemented for B), `submit(signed, paths) -> attempt`,
`track(attempt) -> finalized|expired|failed`. The existing `PaperExecutor` keeps the same plan/build/check shape so
practice exercises the same checks with a simulated sign/submit.

### 7.6 Secrets
Only the provider authorization credential (C), held in a cloud KMS/HSM with sign-only permission from the
executor's identity; never in env files, the repo, logs or the DB. gitleaks already in CI.

### 7.7 Observability
Per-step latency histograms (§3 rows), land rate by path, tip/fee spend, presign deny reasons, auto-trip counts.

### 7.8 TECH_DESIGN §16 delta
- §16.2: keep "the server never holds, derives, receives or stores private keys **or key shares**"; add: "in the
  delegated mode the server may hold one provider *authorization* credential (KMS-resident, sign-only), whose
  powers are bounded by a provider policy and §4; it cannot export keys, change owners or transfer to foreign
  addresses." This rules out Dynamic-style delegated shares and option B. For the Crossmint backup the credential
  must be a Cloud KMS signer (non-extractable), not a raw `server` secret.
- §16.3: generalise from sells to orders; add `presign_check_id`; add the delegated sign path.
- §16.4: align hold to **2,500 ms** (contracts §4.6 already says 2,500; §16.4 says 2 s). Delegated auto-trades
  don't prompt per trade; the four-factor confirmation applies to granting the signer, activating/loosening policy,
  adding withdraw addresses, clearing kill switches, and every manual (A) sell.
- §16.5: limits become policy-as-data (§4.5); loosen after 24 h and auto-revert.
- New §16.8 Kill switch (§5), §16.9 Withdrawals (§4.6), §16.10 Provider choice and exit plan.

### 7.9 TECH_DESIGN §16 is a CANDIDATE TO REVISE (Boss has now picked C)
> rev3: the full diff-style proposal, updated for wallet-only single-owner login, is in
> `TECH_DESIGN_S16_PROPOSAL.md`. The list below is the rev2 summary; the proposal file is authoritative.
**§16 today describes option A** (user-signed, sells only). It stays valid as written until Boss decides. If Boss
picks C, these exact changes go into §16 in a separate, reviewed commit (not in this one):
1. §16 title/intro: "Real SOL sell RPC" -> "Real SOL execution"; two signing paths: delegated (C) for engine orders
   within limits, user-signed (A) for manual sells, over-limit orders and provider outages.
2. §16.1 gating: add a 4th gate, an active, unexpired signer grant whose provider policy hash matches `real_policies`.
3. §16.2 "who signs": replace "never the server" with the §7.8 wording (no wallet keys or key shares on our side; one
   KMS-resident, sign-only provider authorization credential bounded by provider policy + §4.3).
4. §16.2 wallet binding: add the embedded trading wallet (`real_wallets`, role `trading`), separate from SIWS login
   wallets (keeps the existing `WALLET_ROLE_CONFLICT` rule).
5. §16.3 RPC shape: generalise prepare/submit from sells to `real_orders`; add `presign_check_id`; add the delegated
   sign step and the error codes in §7.3.
6. §16.4 confirmation: hold 2 s -> **2,500 ms** (match contracts §4.6); four factors move from "every real sell" to
   "every manual sell + grant signer + activate/loosen policy + add withdraw address + clear kill switch".
7. §16.5 limits: become policy-as-data (§4.5); buys allowed only in rollout stage 2+, screener-pick mints only.
8. §16.6 audit: add presign verdicts, provider activity IDs, policy hash syncs, signer grant/revoke.
9. §16.7 before any code: add provider security review, Boss's provider choice, and the legal opinion (§8).
10. New §16.8 kill switch, §16.9 withdrawals (48 h minimum new-address delay, Boss re-confirmation), §16.10 provider
    choice, lock-in and exit-to-self-custody plan.

---

## 8. Regulatory and custody notes (DEPRIORITIZED for the private single-owner MVP; not legal advice)

> Deprioritized per Boss's direction (relayed by Apex Dev Lead, 2026-10-29): Sentra is a private tool for Boss's own
> funds with no other users. The notes stay for the day that changes; no legal work is planned for the MVP.

- **US (FinCEN FIN-2019-G001):** unhosted-wallet software where the user controls the value is generally not money
  transmission; a provider that hosts value or has total independent control is a money transmitter [L1].
- **EU (MiCA):** custody on behalf of clients is a regulated CASP service; non-custodial wallet software is outside
  it [L2][L3].
- **Indonesia:** crypto supervision moved from Bappebti to OJK on 10 Jan 2025 (PP 49/2024; POJK 27/2024) [L4][L5].
  Relevant only if Sentra is ever offered to others.
- Still worth doing even for one user: read the chosen provider's terms (permitted automated trading, KYC, sanctions)
  before signup.

---

## 9. Recommendation

**Direction set (§D): C with a delegated swap-only signer on a separate, capped, Boss-funded trading wallet; Boss's
main wallet never delegated; withdrawals user-signed to the main wallet only; A (Phantom) stays the manual and
fallback path; B rejected.** Provider: **Turnkey primary, Crossmint challenger** (§D.3), chosen by a devnet bake-off
**only after Boss explicitly approves signups**. Not shortlisted: Privy (Telegram advantage gone, Rust SDK alpha),
Dynamic (our servers would store a key share; conflicts with §16.2), Para (server Guardrails are for app-owned
wallets), Phantom embedded (no delegated user-wallet signing found; Server SDK is app-owned and experimental).

Where we still challenge C (and what we add because of it):
1. **"Non-custodial" is not "no loss on breach."** A stolen signer can still lose money *through allowed trades*
   (T2): trading-wallet cap Boss tops up manually; mint binding to our picks; independent min-out; fee/tip caps; our
   simulation.
2. **TEE trust.** We trust AWS Nitro + the vendor's build pipeline and attestation [T1]. Bounded only by (1).
3. **Lock-in and availability.** Policy-as-data, an export-to-self-custody drill, and A as the manual exit path.
4. **Provider policy gaps.** Turnkey lists top-level transfers only [T4]; Crossmint scopes are transfer-only [C3]:
   §4.3 is mandatory with either.
5. **Large sells via A.** Over-cap and manual sells are signed by Boss in Phantom.
6. **Staged rollout from practice-proven strategies only.** Stage 0: devnet end-to-end (no mainnet funds).
   Stage 1: mainnet **sells-only**, delegated exits on positions Boss opened by hand. Stage 2: delegated buys with tiny
   limits (suggested start for Boss to set: per-trade 0.05 SOL, daily 0.5 SOL, max 3 open positions, trading wallet
   ≤ 2 SOL; proposals, not decisions). Stage 3: raise limits only after N days with zero security-rule hits. Each
   stage needs Boss's sign-off.

---

## 10. Open questions for Boss (rev3)

1. **Bake-off approval:** may we create developer accounts at Turnkey and Crossmint and run the devnet bake-off
   (§D.3 criteria)? Nothing is signed up until you say so.
2. **Budget:** Turnkey per-signature vs Crossmint per-wallet pricing [A1] at your expected trades/day; Jito tips and
   priority fees; a dedicated RPC/sender; an external security review before mainnet.
3. **Owner wallets:** your main Phantom address (login + only withdraw destination) and a backup owner wallet
   (hardware preferred). OK with a 48 h delay to change either?
4. **Limits:** per-trade cap, daily cap, max open positions, trading-wallet maximum balance, max slippage bps, max tip.
5. **Auto-trip thresholds:** loss velocity (% in 15 min / 24 h), failed-tx count, and whether a trip halts exits too.
6. **Step-up:** is a fresh wallet signature enough for money actions, or do you also want passkey/TOTP on top?
7. **Rollout:** agree to the 4 stages, sells-only first, and who signs off each (you alone, or you + Apex).
8. **§16 proposal:** review `TECH_DESIGN_S16_PROPOSAL.md`; it is applied to `TECH_DESIGN.md` only after Phase 7 is approved.

---

## 11. Sources (accessed 2026-10-29)

- [S1] Solana Foundation, Reduced Slot Times (200 ms since 2026-10-09; blockhash ~30 s): https://solana.com/upgrades/reduced-slot-times
- [S2] Solana Foundation, Alpenglow (live 2026-10-21; ~150 ms finality; confirmed = finalized): https://solana.com/upgrades/alpenglow
- [J1] Jito, Low Latency Transaction Send (sendBundle, sendTransaction skips preflight, min tip 1,000 lamports): https://docs.jito.wtf/lowlatencytxnsend/
- [J2] Jito mev-protos JSON-RPC (sendBundle, getTipAccounts, bundle status): https://github.com/jito-labs/mev-protos/blob/master/json_rpc/http.md
- [J3] Helius Sender: https://www.helius.dev/docs/sending-transactions/sender
- [P1] Privy security architecture: https://docs.privy.io/security/wallet-infrastructure/architecture
- [P2] Privy secure enclaves: https://docs.privy.io/security/wallet-infrastructure/secure-enclaves
- [P3] Privy provisioning signers: https://docs.privy.io/wallets/using-wallets/signers/delegate-wallet
- [P4] Privy signers setup / add signers: https://docs.privy.io/wallets/using-wallets/signers/setup , https://docs.privy.io/wallets/using-wallets/signers/add-signers
- [P5] Privy policies overview: https://docs.privy.io/controls/policies/overview
- [P6] Privy blog, Reducing trading latency (2026-05-27; Solana median 72.42 ms; swap API ~190 ms): https://privy.io/blog/reducing-trading-latency-on-privy
- [T1] Turnkey secure enclaves: https://docs.turnkey.com/security/secure-enclaves
- [T2] Turnkey whitepaper, principles ("sub-100ms signing latency"): https://whitepaper.turnkey.com/principles/
- [T3] Turnkey Solana support (enclave parser, SIGN_TRANSACTION): https://docs.turnkey.com/features/networks/solana
- [T4] Turnkey policy language (`solana.tx`, top-level transfers only): https://docs.turnkey.com/features/policies/language
- [T5] Turnkey blog, Solana Policy Engine: https://www.turnkey.com/blog/introducing-solana-policy-engine
- [T6] Turnkey latency probes (k6 benchmarks across providers): https://github.com/tkhq/latency-probes
- [X1] Third-party summary of a provider latency comparison (secondary source; treat as indicative only): https://meme-insider.com/en/article/privy-outpaces-turnkey-in-signing-latency-boosting-meme-coin-trading-efficiency
- [D1] Dynamic delegated access: https://www.dynamic.xyz/docs/embedded-wallets/mpc/delegated-access/overview
- [D2] Dynamic policies: https://www.dynamic.xyz/docs/embedded-wallets/mpc/policies/overview
- [R1] Para guardrails for server-side wallets: https://docs.getpara.com/v3/server/guides/permissions
- [H1] Phantom Server SDK (experimental, partnership access): https://github.com/phantom/phantom-connect-sdk/blob/main/packages/server-sdk/README.md
- [H2] Phantom Browser SDK, sign and send (embedded: signAndSendTransaction only; simulation): https://docs.phantom.com/sdks/browser-sdk/sign-and-send-transaction
- [C1] Crossmint custody models: https://docs.crossmint.com/wallets/concepts/custody-models
- [C2] Crossmint signers (server, Cloud KMS, device, recovery): https://docs.crossmint.com/wallets/concepts/signers
- [C3] Crossmint signer scopes (transfer-only scopes, recipients, spending limit, `expiresAt`): https://docs.crossmint.com/wallets/guides/signers/scopes
- [C4] Crossmint register delegated (operational) signer API: https://docs.crossmint.com/api-reference/wallets/register-delegated-key
- [A1] Apex Dev Lead, research Page "Sentra — Real Money: Login & Wallet Options" (2026-10-29), and the sources it
  links (vendor pricing/SDK pages, Axiom, a comparable Solana trading bot's published terms). Claims marked "per
  Apex" or "reported" were not re-verified by Backend: https://cursor.com/canvas/store-5126697f-8ba1-4316-99b4-f1165b73c1fb/b6afde9c-17d6-4723-a46d-bfd107b8ca57
- [W1] Turnkey, external wallet authentication: https://docs.turnkey.com/solutions/embedded-wallets/integration-guide/react/using-external-wallets/authentication
- [W2] Turnkey, `loginOrSignupWithWallet()` (Solana wallet login, sub-organization): https://docs.turnkey.com/generated-docs/core/turnkey-client-login-or-signup-with-wallet
- [W3] Phantom, Sign a message / SIWS domain and uri validation: https://docs.phantom.com/solana/signing-a-message
- [W4] Phantom, Sign-In-With (SIW) standards (message format): https://docs.phantom.com/developer-powertools/signing-a-message
- [W5] SIWS specification (domain binding, nonce rules, phishing notes): https://osiws.com/docs/specification
- [L1] FinCEN FIN-2019-G001: https://www.fincen.gov/system/files/2019-05/FinCEN%20Guidance%20CVC%20FINAL%20508.pdf
- [L2] MiCA Article 3 definitions (ESMA): https://www.esma.europa.eu/publications-and-data/interactive-single-rulebook/mica/article-3-definitions
- [L3] MiCA Regulation (EU) 2023/1114: https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng
- [L4] OJK/Bappebti joint press release (transfer of crypto supervision): https://ojk.go.id/en/berita-dan-kegiatan/siaran-pers/Pages/Bappebti-Transfers-Regulation-and-Supervision-Duties-on-Digital-Financial-Assets-Crypto-Assets-and-Derivatives-to-OJK-BI.aspx
- [L5] POJK 27/2024: https://ojk.go.id/id/regulasi/Pages/POJK-27-2024-AKD-AK.aspx
