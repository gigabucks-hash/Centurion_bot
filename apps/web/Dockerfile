# syntax=docker/dockerfile:1.7
#
# Centurion web dashboard — production image.
#
# Build from the REPO ROOT, not from apps/web: the web app depends on the file: workspace
# packages under packages/ (contracts, i18n, design-tokens), so they must be in the context.
#
#   docker build -f apps/web/Dockerfile -t centurion-web:local .
#
# BuildKit reads apps/web/Dockerfile.dockerignore for this Dockerfile.
# Runtime env (API_BASE_URL, OWNER_WALLETS, …) is documented in docs/release/web.md.
# NEXT_PUBLIC_* values are compiled into the client bundle, so pass them as --build-arg.

ARG NODE_IMAGE=node:22-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo

# --- dependencies -------------------------------------------------------------------------------
FROM base AS deps
COPY apps/web/package.json apps/web/package-lock.json apps/web/.npmrc ./apps/web/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/i18n/package.json ./packages/i18n/
COPY packages/design-tokens/package.json ./packages/design-tokens/
RUN --mount=type=cache,target=/root/.npm \
    cd apps/web && npm ci --no-audit --no-fund

# --- build --------------------------------------------------------------------------------------
FROM deps AS build
# Public values are inlined by Next at build time; changing them later needs a rebuild.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_AUTH_EMAIL_OTP_ENABLED
ARG NEXT_PUBLIC_AUTH_GOOGLE_ENABLED
ARG NEXT_PUBLIC_AUTH_APPLE_ENABLED
ARG NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED
ARG NEXT_PUBLIC_AUTH_ONBOARDING_ENABLED
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_AUTH_EMAIL_OTP_ENABLED=${NEXT_PUBLIC_AUTH_EMAIL_OTP_ENABLED} \
    NEXT_PUBLIC_AUTH_GOOGLE_ENABLED=${NEXT_PUBLIC_AUTH_GOOGLE_ENABLED} \
    NEXT_PUBLIC_AUTH_APPLE_ENABLED=${NEXT_PUBLIC_AUTH_APPLE_ENABLED} \
    NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED=${NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED} \
    NEXT_PUBLIC_AUTH_ONBOARDING_ENABLED=${NEXT_PUBLIC_AUTH_ONBOARDING_ENABLED} \
    NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
COPY packages ./packages
COPY apps/web ./apps/web
RUN cd apps/web && npm run build

# --- runtime ------------------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0

# Non-root: dedicated uid/gid, no shell login. The standalone bundle is owned by this user.
RUN groupadd --gid 1001 nodejs \
 && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin nextjs

COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3100

# /login is public (no session), so it is a safe readiness probe. Node 22 ships fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:3100/login').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# outputFileTracingRoot is the repo root, so the standalone tree keeps the apps/web prefix.
CMD ["node", "apps/web/server.js"]