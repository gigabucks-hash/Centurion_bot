# Web release: container build and runtime

`apps/web` is the Next.js 16 dashboard. This page covers the deployable **container image** only. It does not
deploy anything, provision TLS, or create infrastructure.

> **Status:** the build is deploy-ready; **the API is not deployed**. Until the backend has a reachable HTTPS
> base URL, the image runs the in-process **mock** BFF (`DATA_SOURCE=mock`) for demos and UI review. Switching to
> `DATA_SOURCE=http` is a configuration change, not a rebuild (except for `NEXT_PUBLIC_*`, see below).

## Files

| File | Purpose |
|---|---|
| `apps/web/next.config.ts` | `output: "standalone"`, tracing root at the repo root (workspace packages) |
| `apps/web/Dockerfile` | multi-stage Node 22 build → slim non-root runtime on port 3100 |
| `apps/web/Dockerfile.dockerignore` | BuildKit ignore file; the context is the repo root |

## Build the image

Docker **23+ / BuildKit** is required (the image uses a cache mount and a Dockerfile-specific ignore file).
Run from the **repo root**, not from `apps/web`: the app depends on `file:../../packages/*`.

```bash
docker build \
  -f apps/web/Dockerfile \
  -t centurion-web:local \
  --build-arg NEXT_PUBLIC_SITE_URL=http://localhost:3100 \
  .
```

### Public values are build-time

Next inlines every `NEXT_PUBLIC_*` value into the client bundle. Pass them as `--build-arg`; changing them at
runtime has no effect. Everything else is read by the server at runtime.

| Build arg | Default | Notes |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3100` | canonical URL for metadata/OG images |
| `NEXT_PUBLIC_AUTH_EMAIL_OTP_ENABLED` | off | optional sign-in method |
| `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` | off | optional sign-in method |
| `NEXT_PUBLIC_AUTH_APPLE_ENABLED` | off | optional sign-in method |
| `NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED` | off | optional sign-in method |
| `NEXT_PUBLIC_AUTH_ONBOARDING_ENABLED` | off | multi-user `/welcome` presets |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | empty | public client id, only for Google sign-in |

Real-time transport is also public (`NEXT_PUBLIC_REALTIME=none|sse|supabase`, plus `NEXT_PUBLIC_SSE_BASE` or
`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`). It is not a Docker `ARG` today; add it to the
build stage before shipping a non-mock realtime transport.

## Run the container

### Mock mode (works today, no backend)

```bash
docker run --rm -p 3100:3100 \
  -e DATA_SOURCE=mock \
  -e CENTURION_INSECURE_COOKIES=1 \
  centurion-web:local
```

`CENTURION_INSECURE_COOKIES=1` is only for plain `http://localhost`. Without it, the production build marks the
session cookie `Secure` and the browser drops it, so every page redirects to `/login`.

### HTTP backend (needs a deployed API)

```bash
docker run --rm -p 3100:3100 \
  -e DATA_SOURCE=http \
  -e API_BASE_URL=https://api.example.com \
  -e API_WORKSPACE_ID=ws_prod_... \
  -e OWNER_WALLETS=<base58-owner-pubkey>[,<another>] \
  centurion-web:local
```

Do **not** set `CENTURION_INSECURE_COOKIES` behind HTTPS.

## Runtime environment

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATA_SOURCE` | prod: `http` | `mock` | `mock` = in-process seed/BFF, `http` = forward to the backend |
| `API_BASE_URL` | with `http` | `http://localhost:8080` | backend base URL, **no trailing slash**, HTTPS in prod |
| `API_WORKSPACE_ID` | with `http` | `ws_mock` | workspace path segment |
| `OWNER_WALLETS` | yes for real use | mock owner | comma-separated base58 **public keys** allowed to sign in (not secrets) |
| `CENTURION_INSECURE_COOKIES` | local http only | unset | `1` allows the session cookie over plain http |
| `CENTURION_AUTH_GATE` | no | enabled | `0` disables the private-app gate; **never in production** |
| `CENTURION_REAL_SOL` | no | `mock` | `disabled` reproduces the production `403 REAL_SOL_DISABLED` state |
| `CENTURION_REAL_GATE_MIN_PAPER_DAYS` | no | built-in | paper-trading threshold before Real is offered |
| `CENTURION_REAL_GATE_MIN_PAPER_TRADES` | no | built-in | paper-trading threshold before Real is offered |
| `CENTURION_MOCK_REAL_DEMO` | no | off | dev/demo only: seed the Real mock workspace |
| `NEXT_PUBLIC_SITE_URL` | recommended | `http://localhost:3100` | **build-time**; canonical public URL |
| `NEXT_PUBLIC_*_AUTH_*` | no | off | **build-time**; optional sign-in methods |
| `NEXT_PUBLIC_REALTIME`, `NEXT_PUBLIC_SSE_BASE`, `NEXT_PUBLIC_SUPABASE_*` | no | `none` | **build-time**; realtime transport |

The image contains **no env file, token, key, or `.env`**. `Dockerfile.dockerignore` excludes every `.env*` path.
If a deployment needs a value that is also a secret (for example a future backend token), inject it at runtime via
the orchestrator's secret store, never via `--build-arg` (build args are visible in image history).

## What the image runs

- Multi-stage: `deps` (`npm ci`) → `build` (`npm run build`) → `runner` (`node:22-bookworm-slim`).
- Runtime contains only `.next/standalone`, `.next/static`, and `public/`; no source, dev dependencies, or package
  manager cache.
- User `nextjs` (uid/gid 1001), not root. `PORT=3100`, `HOSTNAME=0.0.0.0`.
- `HEALTHCHECK` requests `http://127.0.0.1:3100/login` (public route) every 30 s after a 20 s start period.
- The standalone entry is `apps/web/server.js` because Next traces from the repo root.

## Verify locally

```bash
docker run --rm centurion-web:local id                 # uid=1001(nextjs)
docker run --rm centurion-web:local sh -lc 'ls /app'   # apps/ node_modules/ package.json
docker run --rm -p 3100:3100 -e DATA_SOURCE=mock -e CENTURION_INSECURE_COOKIES=1 centurion-web:local
curl -fsS http://localhost:3100/login > /dev/null && echo ok
```

Container logs go to stdout/stderr. Stop with `Ctrl+C` / `docker stop`.

## Deploy risks (not solved here)

1. **The API is not deployed.** `DATA_SOURCE=http` needs a reachable backend, matching contract version (1.1.6),
   and the workspace id. Until then only mock mode is honest.
2. **No production secrets exist for web.** Real sign-in uses SIWS; `OWNER_WALLETS` is public data. Any future
   server-side credential must come from the platform's secret store, not the image.
3. **TLS/reverse proxy is not provisioned.** Terminate TLS in front of the container, forward to port 3100, and
   keep `CENTURION_INSECURE_COOKIES` unset.
4. **No image registry or CI build.** The Dockerfile is verified by a local Next standalone build only; this
   machine has no Docker engine. The first `docker build` should be run where Docker 23+ exists, then the health
   check and non-root user should be confirmed.
5. **Mock state is per container.** Practice resets and session state live in memory; multiple replicas do not
   share them. Production must use the HTTP backend.
6. **SSE through a proxy** needs buffering disabled; `NEXT_PUBLIC_REALTIME` is build-time, so enabling it later
   requires a rebuild.
7. **No WAF/rate limiting in the container.** Put the app behind the platform's ingress controls; the app already
   sends a nonce CSP and HSTS, but HSTS only takes effect over HTTPS.