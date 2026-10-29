# Sentra bake-off: pre-install SDK security review (Turnkey vs Crossmint)

Status: **review done before any install**, 2026-10-29 (Asia/Jakarta). Scope: a **devnet-only** bake-off of a
delegated, swap-only signer on a separate capped trading wallet (REAL_MONEY_OPTIONS.md §D, option C, wallet-only
login, single owner). Nothing in this review signs, holds a mainnet key, or touches real funds. The harness lives in
`services/backend/bakeoff/` (its own private npm package; not a Cargo workspace member; not imported by `api`).

Method: npm registry metadata only (`registry.npmjs.org/<pkg>/latest` and the abbreviated packuments), crates.io API
metadata, published files read from the jsDelivr npm mirror (read, never executed), official docs and GitHub. The
transitive count comes from our own resolver over registry metadata (no tarballs, no `npm install`); it can be off by a
few packages compared with npm's real dedupe. Verdicts were set **before** anything was installed.

## 0. Verdicts at a glance

| Package / surface | Version (pin) | Verdict | Why |
|---|---|---|---|
| **Crossmint REST API** (`https://staging.crossmint.com/api/2025-06-09`, `X-API-KEY`) | API version `2025-06-09` | **GO (preferred)** | Zero dependencies, uses Node's built-in `fetch`. Avoids every red flag of the SDK below. |
| `@crossmint/wallets-sdk` | 1.20.6 (latest) | **NO-GO (red flag)** | On server init it adds a `ServerDatadogSink` that ships SDK logs to `telemetry.crossmint.com/dd` (Datadog forward), sampleRate 100, hard-coded client token. It also pulls EVM stacks (viem, ox, abitype). 69 packages. |
| `@crossmint/server-sdk` | 1.2.93 (latest) | **NO-GO (red flag)** | Pulls `@crossmint/client-sdk-base` → `@datadog/browser-logs` (browser telemetry in a server dependency). It only does JWT/auth helpers, which we don't need. |
| **Turnkey REST API** (`https://api.turnkey.com/public/v1/...`, `X-Stamp` P-256 stamp) | n/a | **GO** | Plain JSON POST. Only the request stamp needs crypto. |
| `@turnkey/api-key-stamper` | **0.6.18** | **GO** (install, exact pin) | No install scripts, no network calls, Apache-2.0, npm provenance attested, published by GitHub Actions. 31 packages total. |
| `@turnkey/http` | 6.7.0 | NOT REQUIRED (not installed) | Clean (no scripts, provenance), but 19.5 MB generated client plus `cross-fetch`. Our adapter posts the JSON itself. |
| `@turnkey/sdk-server` | 8.8.0 | NOT REQUIRED (not installed) | Clean, 43 packages. It wraps `@turnkey/http` and offers nothing the harness needs. |
| `@turnkey/solana` | 1.1.48 | **NO-GO (red flag)** | A server signer helper that pulls `@turnkey/sdk-browser` and `@turnkey/core` → ethers, viem, WalletConnect sign-client, `@solana/web3.js ^1.95.8` (caret). 161 packages of mostly browser/EVM surface. |
| `turnkey_client` / `turnkey_api_key_stamper` (crates.io) | 0.16.1 | Recorded for Phase 7 (Rust executor), not installed | Apache-2.0, repo `tkhq/rust-sdk`, owners `r-n-o` + `github:tkhq:sdk-prod-reviewers`. |

**Supply-chain position:** REST over SDK for both vendors. The only provider package installed is
`@turnkey/api-key-stamper@0.6.18`, so we don't hand-roll the P-256 request stamp. Crossmint needs no package at all.

## 1. Turnkey

### 1.1 Identity
- Repo: `github.com/tkhq/sdk` (monorepo, `packages/api-key-stamper`, `packages/http`, `packages/sdk-server`,
  `packages/solana`). Org: Turnkey (tkhq). npm maintainers: `andrewtk`, `r-n-o`, `jack-kearney-tkhq`. Publisher for all
  the reviewed versions: **GitHub Actions with npm provenance attestations** (2 registry signatures).
- Licence: **Apache-2.0** on every package reviewed.
- Rust: `turnkey_client` 0.16.1 (crate sha256 `a4317cbe090893df6898790fba04cb365e64a0e9ce8bd622b1315518245ba3a2`),
  `turnkey_api_key_stamper` 0.16.1 (sha256 `eceb96b1c2305b3e99b1d8ea1bcd7fc94a920b5997efc1a8da4503b4b39b50f4`),
  published 2026-10-21 07:23 WIB (2026-10-20 21:23 UTC). The client's direct deps are reqwest 0.12, prost 0.12, tokio, serde, and the
  stamper's are p256/k256 0.13. These match our existing Cargo stack and are for Phase 7 only.

### 1.2 Packages (registry metadata, `latest` on 2026-10-29)

| Package | Latest | Integrity (sha512, npm `dist.integrity`) | Install scripts | Direct deps | Transitive (resolved) |
|---|---|---|---|---|---|
| `@turnkey/api-key-stamper` | 0.6.18 (2026-10-16) | `sha512-qKfufzArRpuBtO+iLy90+gjYmsXr86kK2dVsY3YhXUU6qeO3LJVMyc6HIIq1ZVTCsH8fFpXRfi8btHXf9jxhbA==` | none | `@noble/curves ^1.3.0`, `@turnkey/crypto 2.13.3`, `@turnkey/encoding 0.6.0`, `sha256-uint8array ^0.10.7` | ~31 |
| `@turnkey/http` | 6.7.0 | `sha512-EfxzJWmoWnKhn7WF/t5tf5YQgUVHk2EiD5Tievj3uLx/62CYEFxSiD0fn5C0/kvOviA6UfaScYl7NFxOxtAxNQ==` | none | `cross-fetch ^3.1.5`, `@turnkey/encoding`, `@turnkey/api-key-stamper`, `@turnkey/webauthn-stamper` | ~38 |
| `@turnkey/sdk-server` | 8.8.0 | `sha512-QkiAn0/rGlBaKlovRSpXhux4zQ5dQVJNY7Tyoi2QSIRgyrikF2kJNw6GPlKmAlsFKeVu0jOPHpdNfGss07ph4A==` | none | buffer, cross-fetch, `@turnkey/{http,crypto,sdk-types,wallet-stamper,api-key-stamper}` | ~43 |
| `@turnkey/solana` | 1.1.48 | `sha512-8qEYtwxSk5MxEM+nh1dZjwGd/C3/nx7MT5D3BTaARUn3DqJ+3yEnQpjRwANmlFpkHNHG4cgrTwEqKFhquF7r0A==` | none | `@turnkey/core`, `@turnkey/http`, `@solana/web3.js ^1.95.8`, `@turnkey/sdk-server`, `@turnkey/sdk-browser` | **~161** |

Transitive note for the stamper: `@turnkey/crypto@2.13.3` brings `@peculiar/x509` (+ tsyringe, reflect-metadata,
pvtsutils, asn1 helpers), `borsh`, `cbor-js` and `@noble/*`, which is most of the 31. `@turnkey/encoding@0.6.0` is the
one package in the tree that was **published manually** (by `andrewtk`) **without a provenance attestation**. It's a
yellow flag, not a red one: it's the same org, 65 KB of base64/bs58 code with no network access, and it's pinned by
lockfile integrity.

### 1.3 Telemetry / network on import
We read the published `dist/` of `@turnkey/api-key-stamper@0.6.18`, `@turnkey/crypto@2.13.3`,
`@turnkey/encoding@0.6.0` and `@turnkey/http@6.7.0` (jsDelivr mirror, read only):
- There's **no `fetch`, `http(s)` require, `XMLHttpRequest`, `sendBeacon`, telemetry or analytics** in the stamper, crypto
  or encoding. The only URLs are code comments (NIST, MDN, tink, RFC 9180).
- The stamper picks its runtime by environment detection. On Node it uses `node:crypto` (`createSign("SHA256")` over
  the request body, with a JWK built from the hex P-256 key) and returns header `X-Stamp`.
- `@turnkey/http` makes network calls only when you invoke a client method (to the configured `baseUrl`).

### 1.4 Auth model
Every API call is a JSON POST signed with a **P-256 API key** ("stamp"): header `X-Stamp` = base64url JSON
`{publicKey, scheme: "SIGNATURE_SCHEME_TK_API_P256", signature}` over the exact body. Keys belong to a Turnkey **user**
(we would create an **API-only user** for the delegated signer), and permissions come from org **policies**.
Root-quorum actions can't be granted by policy [T4].

### 1.5 Policy engine vs our needs [T4]

| Need | Turnkey support | Notes |
|---|---|---|
| Program allowlist | **Yes**: `solana.tx.program_keys.all(p, p in [...])`, per-instruction `program_key` | Programs loaded via an address lookup table are **rejected by Turnkey**, which is good. |
| Instruction-level visibility | **Yes**: `solana.tx.instructions[]` (program, accounts, `instruction_data_hex`). `parsed_instruction_data` once an IDL is uploaded (pump.fun and Raydium CPMM/CLMM are Anchor programs, so their IDLs can be uploaded). | Discriminator checks are possible in policy. |
| Per-tx SOL cap | **Partial**: `solana.tx.transfers[].amount` covers **top-level System transfers only**. Swap input amounts sit in instruction data. They can be capped via IDL args (`max_sol_cost`, `amount_in`) or hex slicing. | Our pre-sign layer + simulation must remain the real cap. |
| Deny transfers to non-owner | **Yes, top-level only**: `transfers.all(t, t.to in [...])`, `spl_transfers.all(...)` | CPI transfers aren't visible, so this is covered by our parser + simulation. **ALT-resolved accounts show as `ADDRESS_TABLE_LOOKUP`**, so the policy must require `address_table_lookups.count() == 0` (or deny the placeholder). |
| Daily / windowed cap | **No native counter** | It's time windows (`CronSpan`), not cumulative spend. The daily cap stays in Sentra. |
| Signer expiry | API-key expiration (`expiration_seconds`) | Good for the re-grant cadence (§4.2). |

Default effect is deny: an activity needs an ALLOW policy, and an ALLOW policy that errors doesn't allow it.

### 1.6 Key export / revoke
- Export: `EXPORT_WALLET` / `EXPORT_WALLET_ACCOUNT` (encrypted to a target public key). It's governed by policy, so
  the delegated API-only user gets **no** export permission. The owner (root/Boss) can export to self-custody.
- Revoke: `DELETE_API_KEYS` / `DELETE_USERS` for the delegated user, or delete or narrow the policy. Takes effect at
  the next activity. Root-quorum users can't be modified by non-root users.

### 1.7 Devnet support
Turnkey signs Solana transactions chain-agnostically (`SIGN_TRANSACTION_V2`, `TRANSACTION_TYPE_SOLANA`). The cluster is
whatever **our** RPC broadcasts to. Turnkey API keys are **not cluster-scoped**, so the harness enforces devnet itself:
an RPC URL guard, a `getGenesisHash` check, and a devnet blockhash in every message, which makes a signed tx invalid on mainnet.
**Use a dedicated bake-off Turnkey org**, never the one Phase 7 would use.

## 2. Crossmint

### 2.1 Identity
- Repo: `github.com/Crossmint/crossmint-sdk` (monorepo). npm maintainers: `pascualino`, `pegidopaella`,
  `maxwellfortney`, `alfonso_paella`, `devlyn-paella`, `albertoelias-xm`, `guilleaszyn-crossmint`, `manuxmint`.
  Publisher: GitHub Actions with provenance attestations. Licence **Apache-2.0**.

### 2.2 Packages

| Package | Latest | Integrity (sha512) | Install scripts | Direct deps | Transitive |
|---|---|---|---|---|---|
| `@crossmint/wallets-sdk` | 1.20.6 (2026-10-27 00:54 WIB) | `sha512-R2KvFAaK4DXSv++vwnv3LkETdzH9CN2kFwdsGi885ItkXC22UVf+P/1NCsblt00DJhFEMgm8CjajrNBwPA9z1w==` | none | ox 0.6.9, bs58, **viem 2.57.7**, abitype, base32.js, `@noble/*`, `@solana/web3.js 1.98.1`, `@hey-api/client-fetch`, `@crossmint/{client-signers, common-sdk-auth, common-sdk-base, client-sdk-window, client-signers-cryptography}` | ~69 (incl. `@datadog/browser-logs`, `@datadog/browser-core`) |
| `@crossmint/server-sdk` | 1.2.93 | `sha512-bnZLq6FLpXWhmIfWMkzFuzTKeRpyoiKntbUK9cEBiwnYbxu1TNIWGC/BaOIfKVnSVuXens61Wu33fpY0v8GKxQ==` | none | jose 5.9.6, `@crossmint/common-sdk-auth`, `@crossmint/common-sdk-base` | ~14 (incl. `@datadog/browser-logs`) |

### 2.3 Telemetry (RED FLAG)
Read from the published `dist/` (jsDelivr mirror):
- `@crossmint/wallets-sdk@1.20.6`: when `createCrossmint({apiKey})` is initialised, the SDK logger detects the platform
  and, for `"server"`, adds `new ServerDatadogSink(environment)` (`dist/chunk-Z6SPB6EI.cjs`).
- `@crossmint/common-sdk-base@0.13.0` `ServerDatadogSink` batches log records (10 per batch, 5 s) and POSTs them to
  `https://telemetry.crossmint.com/dd?ddforward=https://http-intake.logs.datadoghq.com/v1/input/<client token>`
  with `sampleRate: 100`. We found no documented opt-out flag in the bundle.
- `@crossmint/client-sdk-base@4.6.1` `DatadogProvider` calls `datadogLogs.init({clientToken, site:"datadoghq.com",
  sessionSampleRate:100})` on the first log call.

So a signer process using the SDK would send operational logs (contents not audited; at minimum package, version,
environment, projectId, platform) to a third party. That's not acceptable for a trading signer. The REST API gives
the same functionality with none of it. **Verdict: NO-GO for both SDK packages; use REST.**

### 2.4 Auth model
Server API key in header `X-API-KEY` (`sk_staging_…` / `sk_production_…`). A client key (`ck_…`) is for browsers only.
The staging base is `https://staging.crossmint.com/api` (testnets: Solana devnet), and production is
`https://www.crossmint.com/api` (mainnets) [C5]. A wallet's operational signer here is an **external-wallet**
(a devnet ed25519 keypair the harness holds). Each transaction comes back `awaiting-approval` with
`approvals.pending[].message`, which the signer signs and POSTs to `/transactions/{id}/approvals` [C6].

### 2.5 Policy engine vs our needs [C3]

| Need | Crossmint support | Notes |
|---|---|---|
| Program allowlist | **No** | Scopes are `transfer`-only. |
| Instruction-level visibility | **No** (provider side) | Txs are simulated by Crossmint (422 on simulation failure), but there are no rules on instructions. |
| Per-tx cap | **Partial**: `spendingLimit {amount, interval}` per token, **cumulative** per interval (no per-tx cap; omit `interval` for a lifetime cap) | Enforced on-chain by the smart-wallet policy. Whether a swap's SOL spend counts against it must be **measured** (bake-off test). |
| Deny transfers to non-owner | **Yes, for transfers**: `recipients` whitelist per token | Must test whether a CPI transfer inside an arbitrary program is caught. |
| Signer expiry | `expiresAt` | Yes. |
| Signer without scopes | **Full control** | Our delegated signer must **always** be created with scopes. |

Conclusion: Crossmint can't express swap-only by itself. The swap-only floor would rest entirely on our pre-sign layer
(REAL_MONEY_OPTIONS §D.3 predicted this, and the docs confirm it).

### 2.6 Key export / revoke
- Smart wallet (program account). With an **external-wallet recovery method** (Boss's Phantom in Phase 7), the owner
  already holds self-custody of the controlling key. Crossmint's "export private key" exists only for email/phone signers [C7],
  so there's no raw-key export for our setup, and none is needed.
- Revoke: `DELETE /2025-06-09/wallets/{locator}/signers/{signer}`. It must be **approved by a recovery method** (the owner
  signs the returned approval) [C8], so our server can't silently re-grant or un-revoke.

### 2.7 Devnet support
Yes: the staging environment equals testnets (Solana devnet). The harness refuses unless `CROSSMINT_ENV=staging`, the base URL
host is `staging.crossmint.com`, the key prefix is `sk_staging_`, and the RPC cluster is devnet (genesis hash check).

### 2.8 Account findings (from the account setup, 2026-10-29)
1. **Crossmint staging only offers pre-generated full-access API keys with no scoping.** We can't make a
   least-privilege key (e.g. `wallets:transactions.create` + `wallets:transactions.sign` only) for the signer
   process. This is a **finding against Crossmint for Phase 7**: production must support scoped keys, or the signer's
   API key is a full-project credential.
2. **The staging server key may have been exposed on screen during setup.** It **must be rotated after the
   bake-off** (tracked as an open item). Keys live only in `/home/box/.secrets/sentra_bakeoff.env` (mode 600), loaded
   at runtime, and are never committed or logged. The harness's redaction check fails the run if any loaded secret value
   or an `sk_staging_`/`ck_staging_`-shaped token appears in output or committed files.

## 3. Devnet program IDs (verified)

Checked on devnet with `getMultipleAccounts` (read-only, slot 516,401,829, 2026-10-29 18:35 WIB). Executable means
deployed.

| Program | ID | Devnet | Source |
|---|---|---|---|
| pump.fun bonding curve | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | executable | pump-public-docs: "deployed … on both Mainnet and Devnet" [P1] |
| PumpSwap AMM | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | executable | pump IDL constant / pumpdocs "same addresses on Mainnet and Devnet" [P1][P2] |
| Raydium AMM v4 (devnet) | `DRaya7Kj3aMWQSy19kSjvmuwq9docCHofyP9kanQGaav` | executable | raydium-sdk-V2 `DEVNET_PROGRAM_ID.AMM_V4` [R1] |
| Raydium CPMM (devnet) | `DRaycpLY18LhpbydsBWbVJtxpNv9oXPgjRSfpF2bWpYb` | executable | `DEVNET_PROGRAM_ID.CREATE_CPMM_POOL_PROGRAM` [R1] |
| Raydium CLMM (devnet) | `DRayAUgENGQBKVaX8owNhgzkEDyoHTGVEGHVJT1E9pfH` | executable | `DEVNET_PROGRAM_ID.CLMM_PROGRAM_ID` [R1] |
| Jupiter v6 aggregator | `JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4` | **NOT a program on devnet** (system-owned, not executable) | Jupiter docs list it as mainnet [J4]. Jupiter's API doesn't route on devnet. |
| SPL Memo v2 | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | executable | used for the latency memo tx |
| System / Compute Budget / Token / Token-2022 / ATA | `11111111111111111111111111111111`, `ComputeBudget111111111111111111111111111111`, `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`, `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`, `ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL` | executable | |

Mainnet Raydium IDs differ (`675kPX9M…` AMM v4, `CPMMoo8L…` CPMM, `CAMMCzo5…` CLMM [R1]). The harness keeps
**separate devnet and mainnet tables**, and the devnet allowlist **excludes Jupiter**, because a program that doesn't exist must not be
allowlisted. Jupiter testing is mainnet-only and is out of scope for this run.

Allowed instructions (from the IDLs / source): pump `buy`, `buy_v2`, `buy_v3`, `buy_exact_sol_in`, `sell`, `sell_v2`,
`sell_v3` (discriminators from `pump.json` [P1]). Raydium CPMM `swap_base_input` / `swap_base_output` and CLMM `swap` /
`swap_v2` use Anchor discriminators (`sha256("global:<name>")[0..8]`). Raydium AMM v4 uses tags 9/11/16/17 (`SwapBaseIn`,
`SwapBaseOut`, `SwapBaseInV2`, `SwapBaseOutV2`) [R2]. Anything else on those programs is denied.

## 4. Open risks
1. **Provider floors are top-level only (Turnkey) or transfer-only (Crossmint).** CPI movements inside an allowlisted
   program are caught only by our parser and simulation. Simulation must assert balance deltas (REAL_MONEY_OPTIONS §4.3 step 9).
2. **Crossmint has no program allowlist.** A compromised Sentra server with the Crossmint key could sign any
   non-transfer instruction. That's the key difference from Turnkey, and the bake-off measures it.
3. **Crossmint keys are full-access** in staging (§2.8). The key may have been exposed, so rotate it after the bake-off.
4. **Turnkey keys aren't cluster-scoped.** Use a dedicated bake-off org, and never reuse it for Phase 7.
5. `@turnkey/encoding@0.6.0` has no provenance (yellow). It's pinned by lockfile integrity, and we re-check at every bump.
6. Caret ranges inside the stamper's deps (`@noble/curves ^1.3.0`, `sha256-uint8array ^0.10.7`) are frozen by
   `package-lock.json`, installed with `npm ci --ignore-scripts`, and `.npmrc` sets `ignore-scripts=true`.
7. Program upgrades: the allowlisted programs are upgradeable (BPFLoaderUpgradeable). Pin by ID, and in Phase 7 also
   watch for upgrade-authority changes.
8. We used REST shapes from Crossmint's OpenAPI (API version `2025-06-09`). A breaking API change would show up as
   harness errors, never as silent signing.

## 5. Env var names (values never committed)

| Var | Used by | Rule |
|---|---|---|
| `SOLANA_CLUSTER` | all | must be `devnet` |
| `SOLANA_RPC_URL` | all | host must be a devnet host; genesis hash must equal `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` |
| `CROSSMINT_ENV` | Crossmint | must be `staging` |
| `CROSSMINT_SERVER_API_KEY` | Crossmint | must start with `sk_staging_` |
| `CROSSMINT_CLIENT_API_KEY` | (unused by the server harness; redaction-checked) | `ck_staging_` |
| `CROSSMINT_API_BASE_URL` | Crossmint (optional) | must be `https://staging.crossmint.com/api` |
| `TURNKEY_API_BASE_URL` | Turnkey (optional) | default `https://api.turnkey.com` |
| `TURNKEY_ORGANIZATION_ID` | Turnkey | dedicated bake-off org |
| `TURNKEY_API_PUBLIC_KEY` / `TURNKEY_API_PRIVATE_KEY` | Turnkey (admin, setup only) | |
| `BAKEOFF_LIVE` | harness | must be `1` for any provider network call; tests never set it |
| `BAKEOFF_SECRETS_FILE` | harness | default `/home/box/.secrets/sentra_bakeoff.env` |
| `BAKEOFF_STATE_DIR` | harness | default `/home/box/.secrets/sentra_bakeoff_state` (devnet test keypairs, mode 600, outside the repo) |

## 7. Install record (after the review)
- Installed into `services/backend/bakeoff/` only: **`@turnkey/api-key-stamper@0.6.18`**, exact pin in `package.json`.
  `package-lock.json` is committed, and the install ran as `npm ci --ignore-scripts` (with `.npmrc` `ignore-scripts=true`, `save-exact=true`).
  The lockfile integrity is `sha512-qKfufzArRpuBtO+iLy90+gjYmsXr86kK2dVsY3YhXUU6qeO3LJVMyc6HIIq1ZVTCsH8fFpXRfi8btHXf9jxhbA==`, which **matches §1.2**.
  33 packages, 0 with install scripts. `npm audit signatures`: 33 verified registry signatures and 20 verified attestations.
  `npm audit`: 0 vulnerabilities.
- **Not installed:** `@crossmint/wallets-sdk`, `@crossmint/server-sdk` (red flag), `@turnkey/solana` (red flag),
  `@turnkey/http`, `@turnkey/sdk-server` (not required).

## 8. Live results: Crossmint staging + Solana devnet (2026-10-29, 18:50–19:05 WIB)

Run via `npm run live:crossmint` with devnet test keypairs only (owner/recovery stand-in, delegate, foreign recipient,
stored mode 600 in `/home/box/.secrets/sentra_bakeoff_state`). No real funds. Smart wallets `B2HHttwq…KJT3Jv`
(latency, negatives, revoke) and `A7k8M65W…9Qcoxy` (escalation probe). Raw JSON is in `bakeoff/results/` (gitignored and
redaction-checked).

**On-chain shape (observed).** Crossmint wraps our instructions: the fee payer is a Crossmint staging relayer
(`34U6iAJm…`), our delegated key signs on chain, and smart-wallet program `XmSwiXQsxSZYKVYbSAkkvQVvdrKo1nwwfvZBPQrLzbU`
(`ExecuteTransaction`) **CPIs** our instructions. Consequences:
(a) Fees are sponsored (10,040 lamports per tx observed on devnet).
(b) Our instructions are CPIs on chain, so a top-level-only parser on the final tx would see only the wrapper. Sentra's
pre-sign must parse the **inner** tx we submit, which it does.
(c) The wallet PDA holds 0 lamports, so our simulator substitutes a funded fee payer (`BAKEOFF_SIM_FEE_PAYER`) and
simulates our instructions.

| Test | Result |
|---|---|
| Latency, 60/60 memo txs through the full pipeline (pre-sign + RPC simulate + Crossmint create, approve and wait) | **60 ok, 0 failed.** Sign (create + approval round trip): **p50 524 ms, p95 999 ms**. End-to-end to Crossmint `success`: **p50 2,598 ms, p95 4,302 ms** (includes 250 ms poll granularity). |
| Transfer out to a foreign address | Pipeline: **rejected by Sentra pre-sign** (`TRANSFER_TO_NON_OWNER`). Provider only: 422 at Crossmint's simulation, but the logs show the smart-wallet program **forwarded the transfer to the System program**, which failed with `0x1` (insufficient lamports; the wallet holds 0 SOL). So **the recipient scope did not stop it before execution**, and the outcome with funds is **untested**. |
| Over-cap | Pipeline: **rejected by Sentra** (`OVER_CAP` on a pump.fun `buy` with `max_sol_cost` 0.025 SOL > 0.01 cap). Provider only: no per-tx cap exists (the scope is cumulative and transfer-only). The 422 came from the placeholder pump accounts (`Custom 3012`), not from a cap. |
| Non-allowlisted program (Memo v1) | Pipeline: **rejected by Sentra** (`PROGRAM_NOT_ALLOWED`). Provider only: **Crossmint signed and landed it** (confirmed on devnet). This confirms on chain that Crossmint has **no program allowlist**. |
| Delegated-signer escalation (delegate registers a new unscoped signer and approves it itself) | **Rejected by Crossmint**: "Signature is not pending for signer (delegate) … pending: (recovery)". Only the recovery method can approve signer changes. One dangling `awaiting-approval` signer-add tx remains, inert without the owner's signature. |
| Outage (provider unreachable, induced with a 1 ms timeout × 5) | **5/5 failed closed** (no signature, nothing sent), and the next call recovered (confirmed, 2.65 s). Approvals are separate calls, so a create that times out can never land unsigned. |
| Revoke (DELETE signer + owner approval) | **2.85 s** to revoke. The next sign attempt was rejected with HTTP 400 "Delegated signer … not found". |
| Export | Not applicable to this setup: the owner (external-wallet recovery) holds its own key. Crossmint export exists only for email/phone signers. The delegate can't export. |
| Cost | Staging is free. Public pricing (crossmint.com/pricing, read 2026-10-29): the Developer tier has **1,000 monthly active wallets free and "up to 2,000 transactions"**, with $0.025/MAU overage. The policy engine and signature-based pricing are custom (contact sales). At an assumed ~20 trades/day (~600 tx/month) the free tier covers it. Who pays production fee sponsorship is unknown. |

**Not measurable this run:** the devnet RPC faucet is closed (`requestAirdrop` → 410, "use faucet.solana.com"), so the
wallet has 0 SOL. The provider-side **recipient whitelist and spendingLimit enforcement with real funds** is
therefore **untested**. To finish it, fund the smart wallet with ~0.05 devnet SOL (web faucet or a funded devnet
wallet) and rerun `--phase=negatives`.

**Turnkey:** no `TURNKEY_*` vars are present yet, so it stays on mocks (mock p50/p95 sign 97/148 ms, e2e 589/1,126 ms
with an injected 5-call outage that failed closed, from Turnkey's *vendor-claimed* figures and not measured).
`TurnkeyRest` is wired behind `BAKEOFF_LIVE=1` and the devnet guard.

### 8.1 Interim recommendation
On this evidence Crossmint fails the bake-off criterion "can the provider policy alone reject a non-allowlisted program"
(REAL_MONEY_OPTIONS §D.3): it **landed a non-allowlisted program call** and has no per-tx cap. Its floor is
"only the delegate key can sign, and only the owner can change signers", which is good. But swap-only rests 100% on
Sentra's pre-sign layer. Add the full-access-only staging keys (§2.8) and the SDK telemetry (§2.3), and **Turnkey
stays primary**, pending its live run under the same tests. Crossmint stays the fallback only if Turnkey fails.

## 6. Sources (accessed 2026-10-29)
- npm registry: `https://registry.npmjs.org/@turnkey%2Fapi-key-stamper/latest` (and likewise for every package above);
  crates.io API `https://crates.io/api/v1/crates/turnkey_client`
- [T4] Turnkey policy language: https://docs.turnkey.com/features/policies/language
- [T3] Turnkey Solana: https://docs.turnkey.com/features/networks/solana
- [C3] Crossmint signer scopes: https://docs.crossmint.com/wallets/guides/signers/scopes
- [C5] Crossmint Wallets OpenAPI servers (staging = testnets): https://docs.crossmint.com/api-reference/wallets/create-wallet.md
- [C6] Crossmint create / approve transaction: https://docs.crossmint.com/api-reference/wallets/create-transaction.md ,
  https://docs.crossmint.com/api-reference/wallets/approve-transaction.md
- [C7] Crossmint export private key (email/phone signers only): https://docs.crossmint.com/wallets/guides/export-private-key
- [C8] Crossmint remove signer (recovery approval): https://docs.crossmint.com/wallets/guides/signers/remove-signer
- Crossmint telemetry code: jsDelivr `@crossmint/common-sdk-base@0.13.0/dist/logger/sinks/ServerDatadogSink.cjs`,
  `@crossmint/wallets-sdk@1.20.6/dist/chunk-Z6SPB6EI.cjs`, `@crossmint/client-sdk-base@4.6.1/dist/chunk-66MC2P4S.cjs`
- [P1] pump-public-docs: https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md and `idl/pump.json`
- [P2] https://www.pumpdocs.fun/
- [R1] Raydium SDK V2 program IDs: https://github.com/raydium-io/raydium-sdk-V2/blob/master/src/common/programId.ts
- [R2] Raydium AMM instruction tags: https://github.com/raydium-io/raydium-amm/blob/master/program/src/instruction.rs
- [J4] Jupiter program-id-to-label: https://developers.jup.ag/docs/api-reference/swap/v1/program-id-to-label
