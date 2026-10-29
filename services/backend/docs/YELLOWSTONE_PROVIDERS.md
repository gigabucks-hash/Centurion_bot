# Yellowstone (Geyser) gRPC Providers: Comparison for Centurion Trade

- **Researched:** 29 Oct 2026, 18:56–19:20 WIB (UTC+7). Prices come from official pricing/docs pages fetched on this date. Nothing was signed up for or purchased.
- **Workload:** one user (Boss), mainnet. Filtered streams for pump.fun, Raydium and Meteora launches and swaps, plus account updates for held positions. Boss is in Jakarta and the backend region is flexible, so **Singapore (SGP) or Tokyo (TYO) is the natural backend location**.
- **Rule used:** a figure marked "not published" was not found on official pages. Third-party numbers are labelled as such.

## Summary for Boss

- **Budget pick: Shyft Build, $199/bln flat.** It is unmetered (no data bill surprise), has a **Singapore** region, and replays the last ~150 slots after a disconnect. If our filtered stream is small, Triton PAYG could be cheaper ($125 deposit + $0.08/GB), but Triton doesn't publish whether it has an Asia gRPC location.
- **Performance pick: Helius Business, $499/bln.** It has **Singapore + Tokyo** endpoints, a 48-hour replay, automatic multi-node failover and a shredstream-fed backend. Usage is credit-metered, but at 2 credits per 0.1 MB our filtered stream should fit within the 100M included credits. ERPC Burst (€398/bln, SGP/TY, built from raw shreds, 1-day free trial) is the strong alternative for raw speed.
- **Before paying anything:** run a 1-day bake-off. Use ERPC's free trial and the Helius devnet stream, and measure p50/p95 arrival time from a Singapore VPS with the existing runner. Then pick.
- **If gRPC is overkill:** Helius Developer at $49/bln gives `transactionSubscribe` over WebSocket. It is cheaper, but has no replay or failover and is slower. That's acceptable for an MVP or paper trading, not for sniping launches.

## Comparison table

| Provider | Cheapest plan with mainnet Yellowstone gRPC | Billing model | Stream limits / filters | Asia regions | Shared / dedicated | Free trial (gRPC) | Replay (`from_slot`) | Latency claim (vendor) |
|---|---|---|---|---|---|---|---|---|
| **Helius LaserStream** | **Business $499/mo** (Developer $49 = devnet gRPC only) | Credits: 2 credits / 0.1 MB uncompressed; Business has 100M credits/mo | Concurrent-stream limit not published. Compressed filters, `tokenAccounts`, `matchMints`. Logs truncated to 10 KB by default | **Tokyo `tyo`, Singapore `sgp`** | Shared multi-node, fully managed. Dedicated: not published | No for mainnet (devnet only on Free/Dev) | **~48 h (~691k slots)**. Data older than ~20 min is finalized-only | "Ultra-low latency", shredstream-enabled, taps leaders for shreds |
| **Triton One (Dragon's Mouth / Riptide)** | **PAYG: $125 prepaid deposit** (valid 12 mo, non-refundable) | **$0.08/GB** streaming bandwidth, no monthly minimum stated | "Flexible" connection and rate limits; numbers not published. Cuckoo compressed filters. Deshred stream in paid beta | gRPC regions not published. Riptide auto-routes to the nearest POP. Tokyo is listed only for Shred Streaming | Shared (Riptide) or dedicated nodes (price not published) | No trial stated; activation needs the $125 deposit | Yes, buffered window; size not published (`SubscribeReplayInfo` reports it) | "Up to 400 ms advantage" vs regular RPC |
| **QuickNode** | **Scale $499/mo** (or Build $49 + $499 add-on = $548) | API credits: 10 credits/0.1 MB on the FAQ; docs say **15 credits/0.1 MB from 1 Oct 2026** (conflict) | Scale: **10 streams, 10 accounts/stream**. Business $999: 25 / 50 | **Tokyo (NRT)**, no Singapore. Also JFK, EWR, FRA, IAD | Shared. Dedicated = Enterprise custom | **No** (free trial excludes gRPC) | ~3,000 slots (~20 min) | "Processed up to 1.5 s" (FAQ). No ms claim |
| **Chainstack** | **Growth $49 + gRPC add-on $49 = $98/mo** (2 streams). Add-on 7 streams $149, 25 streams $449 | Add-on flat, "unlimited stream events". Plan RU for RPC | 2/7/25 streams per account, **200 keys per filter**, 5 account filters/request. **Token Program and System Program rejected** in key filters | Platform has Asia-Pacific; gRPC endpoint is geo-balanced, Asia gRPC POP not explicitly published | Shared Global Node. Dedicated node from $0.50/h + storage (Pro plan+) | No (free Developer plan has no gRPC) | **~100 slots (~1 min)** on Global Nodes | Not published |
| **Shyft** | **Build $199/mo** (Grow $349, Accelerate $649) | **Flat, unmetered**: no bandwidth or egress charges | 10/20/50 connections (+$100 per 10). 150k tx-filter addresses, 400k account addresses, 10 filters/request, unlimited IPs. Token and System Program allowed | **Singapore (SGP)**. Tokyo "coming soon" | Shared. Dedicated gRPC/RPC from $1,800/mo | No (free plan has no gRPC) | **~150 slots** | Not published (marketing: "blazingly fast") |
| **ERPC (Validators DAO / ELSOUL)** | **Standard €198/mo** (list €398, also €0.34/h hourly). **Burst €398/mo** | Flat. "Fair-use protection" on shared | Standard: 1 IP, max 10 streams. Burst: 1 IP, up to 50 streams. **No filter limits** | **Tokyo (TY), Singapore (SGP)** for Standard and Burst. Also SYD | Shared. Dedicated bare-metal gRPC from €1,580/mo | **1-day free trial** (stated for Burst) and hourly billing | Not published | Burst (raw-shred-powered): 99.80% first-arrival win, ~400–500 ms faster than its Standard/Premium (**Frankfurt measurement**) |
| **Syndica** | **N/A: retired** | n/a | n/a | n/a | n/a | n/a | n/a | Solana RPC + ChainStream retired 14 Feb 2026 |
| *Other:* Solana Vibe Station | Basic $150/mo (5 conns). Ultra $200 (10), Elite $250 (15). Basic also $15/day | Flat | 5/10/15 connections | **None**: ATL + AMS only | Shared + colo VPS | Free RPC tier only | "Live only" | Not published |
| *Other:* Subglow | Sniper $99/mo ($79 first 3 mo), 2 streams. Pro $249, 10 streams | Flat | Sniper: pump.fun/Raydium/Jupiter only, **no Meteora / custom program IDs** (Pro+) | **None**: FRA/NY4 colo on Dedicated | Shared / Dedicated | Not published | Not published | Dedicated: "sub-2 ms slot lag" |

### Sources (fetched 29 Oct 2026)

- Helius: https://www.helius.dev/docs/billing/plans · https://www.helius.dev/docs/billing/credits · https://www.helius.dev/docs/laserstream · https://www.helius.dev/docs/laserstream/grpc (regions) · https://www.helius.dev/docs/laserstream/historical-replay
- Triton: https://triton.one/pricing · https://docs.triton.one/project-yellowstone/dragons-mouth-grpc-subscriptions · https://docs.triton.one/project-yellowstone/riptide · https://docs.triton.one/core-features/support-faqs
- QuickNode: https://www.quicknode.com/pricing · https://support.quicknode.com/articles/7564862414-yellowstone-grpc-geyser-plugin-faqs · https://www.quicknode.com/blog/solana-grpc-is-now-included-with-scale-and-business-plans (regions, 3,000-slot replay) · https://www.quicknode.com/docs/solana/solana-grpc/overview
- Chainstack: https://chainstack.com/pricing/ · https://docs.chainstack.com/docs/yellowstone-grpc-geyser-plugin
- Shyft: https://shyft.to/solana-rpc-grpc-pricing · https://docs.shyft.to/solana-yellowstone-grpc/solana-grpc-filter-limits · https://docs.shyft.to/solana-yellowstone-grpc/docs/getting-started/replaying-slots-with-grpc
- ERPC: https://erpc.global/en/price/ · https://erpc.global/en/news/2026/06/23/erpc-geyser-grpc-burst-asia-202606/ · https://erpc.global/en/news/2026/05/04/erpc-geyser-grpc-burst-plan-202605/ · https://erpc.global/en/faq/grpc/general/
- Syndica retirement: https://docs.chainstack.com/docs/migrating-from-syndica-to-chainstack (third-party: Chainstack)
- Solana Vibe Station: https://solanavibestation.com/pricing
- Subglow: https://subglow.io/pricing

## Notable caveats

- **Helius:** mainnet gRPC needs the $499 Business plan. Credits are shared with RPC, DAS and Sender. Autoscaling is on by default, so set a cap. Logs are truncated at 10 KB unless we use an untruncated endpoint. The concurrent-stream cap is not published. Strengths: SGP/TYO, 48 h replay, multi-node failover, and the same vendor for RPC, Sender and priority fees.
- **Triton:** the cheapest option if filtered bandwidth is low (e.g. 100 GB/mo ≈ $8). Exact Asia gRPC POPs are not published. Cancellation needs one calendar month's notice. The deposit is non-refundable. Riptide drops can arrive as TCP RST, so the client must reconnect with `from_slot`.
- **QuickNode:** official docs conflict on metering (10 vs 15 credits per 0.1 MB, and port 10000 vs 443). Scale's **10 accounts per stream** is tight for tracking many positions. There is no Singapore region (Tokyo is). The free trial excludes gRPC.
- **Chainstack:** cheapest on paper ($98), but the 200-key and 5-filter limits, the Token/System Program bans and the ~100-slot replay make it fragile for sniping. Asia gRPC POP is not explicitly published.
- **Shyft:** flat price and generous filters. Singapore is live, Tokyo is not yet. No published ms latency. Replay is only ~150 slots (~1 min).
- **ERPC:** prices are in EUR and shown as heavily discounted from list price. Standard allows only 1 IP whitelist. Burst latency numbers are measured in Frankfurt, and ERPC itself says results vary by region. The replay window is not published.
- **Syndica:** retired, do not use.

## Rough data-volume math (directional)

Helius quotes rough sizes of ~0.0006 MB per transaction and ~0.0004 MB per account update.

| Filtered tx/day | ≈ GB/month | Helius credits (2 per 0.1 MB) | Triton cost ($0.08/GB) | QuickNode credits (15 per 0.1 MB) |
|---|---|---|---|---|
| 1M | ~18 GB | ~0.36M (fits easily in 100M) | ~$1.5 | ~2.7M (fits in 950M) |
| 10M | ~180 GB | ~3.6M | ~$15 | ~27M |
| 50M | ~900 GB | ~18M | ~$72 | ~135M |

**Conclusion:** with tight program filters (pump.fun, Raydium, Meteora program IDs plus our own position accounts), metering is unlikely to exceed any plan's included allowance. The real choice is about **latency from SGP/TYO, replay depth and filter limits**, not data cost. Avoid unfiltered `blocks` subscriptions (~4 MB per block).

## Recommendation

**(a) Budget tier: Shyft Build ($199/mo, flat, Singapore).**
- It is predictable, includes Token Program filters, has 10 connections and gives Boss no surprise invoices.
- Alternative: Triton PAYG ($125 deposit). It is probably cheaper in practice, but confirm Asia routing first.

**(b) Performance tier: Helius LaserStream on Business ($499/mo), SGP endpoint.**
- Singapore and Tokyo endpoints, 48 h replay, multi-node failover, shredstream-fed backend, one vendor with Sender.
- Alternative: ERPC Burst (€398/mo, SGP/TY, built from raw shreds) if a bake-off shows it arrives first from Singapore.

**Suggested next step (needs Boss approval, since it signs up and may spend money):** a 24-hour bake-off from a Singapore VPS comparing Helius, ERPC (1-day free trial), and optionally Shyft or Triton. Measure first-arrival p50/p95 on pump.fun create and swap events with the existing p50/p95 runner, then choose.

## Cheaper alternatives if gRPC is overkill

| Option | Price | Tradeoff |
|---|---|---|
| Helius LaserStream **WebSocket** with `transactionSubscribe` / enhanced `accountSubscribe` | **Developer $49/mo** (10M credits; 2 credits/0.1 MB ≈ ~500 GB) | Runs on the same backend as LaserStream. **No historical replay, no auto-reconnect, no multi-node failover** (manual). WebSocket is less stable than gRPC. Fine for the MVP, paper trading and position monitoring |
| Helius `preprocessedSubscribe` (decoded shreds over WSS) | All paid plans, 0.1 credit/msg | ~8 ms ahead of `processed`, but **no execution metadata or account state** |
| Standard Solana WS (`logsSubscribe` / `programSubscribe`) on any RPC | Free–$49 | Updates arrive only at end of slot, connections drop, no filters beyond basic. Too slow for launch sniping |
| Helius Parsed Streams (`parsedTransactionSubscribe`) | 1 credit/event, all plans | Decoded events save parsing work, but latency claims are not published |

**Suggested path:** use Helius WS ($49) during build and paper trading, then switch to gRPC (Shyft or Helius Business) before real-money Phase 7. Moving from WS to gRPC needs a new stream client. Build the stream layer behind an interface now, so the swap is a config change. All gRPC providers here speak Yellowstone, so switching between them later is mostly an endpoint and token change.

---

## Technical comparison (backend, added 29 Oct 2026 ~19:30 WIB)

The pricing content above is unchanged. This section adds the Yellowstone-level facts the stream client depends on, each cited from the provider's own docs, which were fetched on this date. Alchemy is included because the working recommendation names it as the backup and devnet feed. ERPC, Solana Vibe Station and Subglow were not re-verified here; see the pricing table.

**Common to all providers** (Yellowstone `geyser.proto`, [rpcpool/yellowstone-grpc](https://github.com/rpcpool/yellowstone-grpc)):
- **Commitment:** `PROCESSED` / `CONFIRMED` / `FINALIZED` on `SubscribeRequest.commitment`.
- **Filters:** `accounts` (account / owner / memcmp / datasize), `transactions` (`account_include` / `exclude` / `required`, vote, failed), `slots`, `blocks`, `blocks_meta`, `entry`, plus `accounts_data_slice` and `from_slot`.
- **Pump.fun:** support is just a program filter. A `transactions` filter with `account_include` = Pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` (PumpSwap AMM `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`) works, and so do `accounts` filters on held bonding-curve or pool accounts.
- **Self-hosted servers:** these can cap filters via the config `grpc.filters` (account_max, owner_reject, …). That is where provider limits come from.
- **Auth:** the token goes in the `x-token` **gRPC metadata** header everywhere.

| Provider | Filter / account limits | `from_slot` replay depth | Regions (Asia) | Commitment notes | Auth | Connection / stream limits | Devnet gRPC |
|---|---|---|---|---|---|---|---|
| **Shyft** | 150,000 addresses per tx filter; 400,000 per account filter; **10 filters per SubscribeRequest**; unlimited subscribe updates; Token and System Program allowed [S1] | **~150 slots (~1 min)** [S2][S3] | NY, VA, AMS, FRA, London, **SGP**; Tokyo "coming soon" [S1] | Standard | `x-token` from the dashboard, **or IP whitelist** (then no token) [S3] | **Build 10**, Grow 20, Accelerate 50 connections; +$100 per 10; unlimited IPs [S1] | **Not documented**: only a devnet JSON-RPC (`devnet-rpc.shyft.to`) [S4] |
| **Alchemy** | Numeric caps **not published** (filters by account, owner, program, signature; data slice) [A1][A2] | **Conflicting docs:** the overview says **6,000 slots (~40 min)** [A1]; the replay page says **432,000 slots (~48 h)** [A3]. Over the window → rejected | US East, US West, EU Central, **"Asia-Pacific"** (city not stated) [A4] | Default `CONFIRMED`; zstd supported [A2][A5] | `X-Token` [A1] | **Not published**; multi-producer fan-in, several subscriptions per connection [A5] | **Yes**: `solana-devnet.streaming.alchemy.com`, same price [A1] |
| **Helius LaserStream** | Up to ~10M pubkeys per stream via compressed filter; `tokenAccounts`, `matchMints` extensions [H1][H2] | **~48 h (~691,200 slots)**; older than ~20 min → **finalized-only** data [H3] | **sgp, tyo** (+ ewr, pitt, slc, lax, lon, ams, fra) [H4] | Replay older than ~20 min ignores processed / confirmed semantics [H3] | `x-token` = API key [H5] | Business **10**, Professional 100 concurrent gRPC connections [H2] | Yes (`laserstream-devnet-ewr`, Developer plan+) [H4] |
| **Triton (Dragon's Mouth / Riptide)** | Compressed (cuckoo) filters recommended above ~100 accounts; numeric shared caps not published [T1] | **~1,000 slots** (`SubscribeReplayInfo.first_available`) [T1][T2] | Riptide auto-routes to nearest POP, **no region endpoints** [T3] | Standard | `x-token` metadata only; **token-in-URL → 403 on gRPC** [T4] | Not published | Not on Riptide (mainnet only) [T3] |
| **QuickNode** | Scale **10 accounts per stream**, Business 50; compressed filters bypass [Q1][Q2] | **3,000 slots (~20 min)** [Q3] | **NRT** (+ JFK, EWR, FRA, IAD), no SGP [Q3] | Standard | `x-token` or basic auth, port 10000 [Q4] | Scale **10 streams**, Business 25 [Q1] | Not checked |
| **Chainstack** | **5 account filters, 20 tx filters, 200 keys per list, 2 data slices** per request; **Token Program rejected** in `account_include`, System Program rejected as owner; filters without conditions rejected [C1] | **~100 slots (~1 min)** on Global Nodes [C1] | Global Node, geo-balanced; no Asia gRPC POP published [C1] | Standard | `x-token` = node auth token, port 443 [C1] | 2 / 7 / 25 concurrent streams by add-on tier [C1] | **No** (mainnet only) [C1] |

**Latency to our host:**
- **The production host is not chosen yet** (the pricing section assumes SGP or TYO).
- A probe from the dev box only measured TLS handshakes. The box egresses through Cloudflare WARP (exit Medan, ID), so its TCP times read about 1 ms and are meaningless. Handshake results:
  - Helius sgp 415 ms;
  - Shyft sgp 528 ms;
  - Triton Riptide 635 ms;
  - Helius tyo 665 ms;
  - Shyft ams 696 ms;
  - Helius fra 692 ms;
  - Shyft ny 939 ms;
  - Helius ewr 995 ms.
- The ordering (SGP fastest) is the only usable signal from this probe.
- Shyft's own guidance is to co-locate: they call ping under 10 ms acceptable, and far regions build lag [S3].
- **Action:** measure gRPC first-arrival p50/p95 from the actual SGP VPS before we commit.

### Verification of the working recommendation (Shyft Build primary, Alchemy PAYG backup and devnet, Helius WS paper fallback)

| Claim | Verdict |
|---|---|
| Shyft has a Singapore gRPC region | **Confirmed** [S1]. Tokyo is still "coming soon" |
| Shyft Build = 10 connections, flat / unmetered, generous filters, Token Program allowed | **Confirmed** [S1] |
| Shyft replay covers reconnects | **Weak**: only ~150 slots (~1 min) [S2]. A gap longer than ~60 s needs a backfill path: RPC `getSignaturesForAddress` / `getTransaction`, or replay from the Alchemy backup's larger window |
| Shyft also serves devnet | **No devnet gRPC documented** [S4]. This **supports** using Alchemy for devnet |
| Alchemy PAYG works with no plan or minimum | **Confirmed**: $75/TB, no plan prerequisite, no minimum; not on the Free plan [A6][A4] |
| Alchemy gRPC caps (streams, filters, accounts) | **Not published anywhere I could find.** Treat them as unknown and confirm with Alchemy before relying on Alchemy as a hot standby for the full filter set |
| **Self-imposed byte budget and kill switch for Alchemy are needed** | **Confirmed, and mandatory:** Alchemy's KB says the dashboard **hard cap and spend alerts do NOT cover gRPC streaming bandwidth**, so charges accrue even with a cap set [A6]. The byte counter and kill switch must live in our client (count `SubscribeUpdate` bytes and close the stream at budget). Never send an empty or broad accounts filter |
| Alchemy replay depth | **Contradictory docs** (6,000 vs 432,000 slots) [A1][A3]. Assume 6,000 (~40 min) until we test it |
| Alchemy Asia region close to SGP | **Unverified**: only "Asia-Pacific" is stated [A4] |
| Helius WS as a degraded paper-MVP feed | Consistent with the pricing section. Note there is no replay or failover on WS |

**Bottom line:** nothing contradicts the choice of Shyft Build primary plus Alchemy backup. Two flags:
- Shyft's 1-minute replay means we need the RPC backfill path on day one.
- Alchemy's caps and APAC location are unpublished, so the budget kill switch is ours to build.

### Sources (technical section)

- [S1] https://docs.shyft.to/solana-yellowstone-grpc/solana-grpc-filter-limits
- [S2] https://docs.shyft.to/solana-yellowstone-grpc/docs/getting-started/replaying-slots-with-grpc
- [S3] https://docs.shyft.to/solana-yellowstone-grpc/docs
- [S4] https://docs.shyft.to/solana/shyft-rpcs
- [A1] https://www.alchemy.com/docs/reference/yellowstone-grpc-overview
- [A2] https://www.alchemy.com/docs/reference/yellowstone-grpc-subscribe-request
- [A3] https://www.alchemy.com/docs/reference/yellowstone-grpc-historical-replay
- [A4] https://www.alchemy.com/solana-grpc
- [A5] https://www.alchemy.com/blog/zero-downtime-zero-gaps-solana-grpc-streaming
- [A6] https://support.alchemy.com/articles/5952597732-how-is-solana-grpc-yellowstone-streaming-priced
- [H1] https://www.helius.dev/docs/laserstream
- [H2] https://www.helius.dev/docs/faqs/laserstream
- [H3] https://www.helius.dev/docs/laserstream/historical-replay
- [H4] https://www.helius.dev/docs/laserstream/grpc
- [H5] https://www.helius.dev/docs/api-reference/laserstream/grpc/subscribereplayinfo
- [T1] https://docs.triton.one/project-yellowstone/dragons-mouth-grpc-subscriptions
- [T2] https://blog.triton.one/built-in-auto-reconnect-for-yellowstone-grpc-streaming/
- [T3] https://docs.triton.one/project-yellowstone/riptide
- [T4] https://docs.triton.one/getting-started
- [Q1] https://support.quicknode.com/articles/7564862414-yellowstone-grpc-geyser-plugin-faqs
- [Q2] https://www.quicknode.com/docs/solana/solana-grpc/overview
- [Q3] https://www.quicknode.com/blog/solana-grpc-is-now-included-with-scale-and-business-plans
- [Q4] https://www.quicknode.com/docs/solana/solana-grpc/overview/go
- [C1] https://docs.chainstack.com/docs/yellowstone-grpc-geyser-plugin
