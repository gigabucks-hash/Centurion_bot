# Centurion bake-off harness (devnet only)

Turnkey vs Crossmint for a **delegated, swap-only signer on a separate capped trading wallet**.
See `../docs/BAKEOFF_REVIEW.md` (pre-install review, verdicts, env var names, devnet program IDs).

- Separate private npm package. It's not a Cargo workspace member, not imported by `api`, and not part of any production build.
- The only provider dependency is `@turnkey/api-key-stamper@0.6.18` (exact pin, lockfile, `npm ci --ignore-scripts`).
  Crossmint is used through its REST API. The SDK is NO-GO because it ships telemetry (review §2.3).
- **Devnet only:** `SOLANA_CLUSTER=devnet`, a devnet RPC host and the devnet genesis hash are all required. Crossmint also needs
  `CROSSMINT_ENV=staging`, `staging.crossmint.com` and an `sk_staging_` key. Any provider network call needs `BAKEOFF_LIVE=1`.

```bash
npm ci --ignore-scripts
npm test                      # mocks only, no network
npm run bench:mock            # >=50 runs per provider, p50/p95, injected outage
npm run redaction-check       # must PASS before every commit
# live (Crossmint staging + Solana devnet), secrets loaded at runtime only:
set -a; . /home/box/.secrets/centurion_bakeoff.env; set +a; SOLANA_CLUSTER=devnet BAKEOFF_LIVE=1 npm run live:crossmint
```

Layers: `src/presign.ts` (our decode + allowlist + caps + transfer denial + simulation) always runs before
`SignerProvider.signAndSend` (`src/pipeline.ts`). The provider-only probes in the live script call the provider
directly **on purpose**, to measure each vendor's own floor, using devnet test keys only.
