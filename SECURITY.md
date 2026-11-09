# Security policy

Centurion Trade is a paper-trading app. The repository and its services hold no private keys or
seed phrases, and live execution is locked in code (`TRADING_MODE=paper`).

## Reporting a vulnerability

Do **not** open a public issue for a security problem.

Use GitHub private vulnerability reporting: **Security → Advisories → Report a vulnerability**
on this repository. Include the affected component (`apps/web`, `apps/desktop`,
`services/backend`, `tools/paper`), a reproduction, and the impact you believe it has.

You can expect an acknowledgement within 3 business days and a status update within 10.

## Scope

In scope: authentication and session handling (SIWS, cookies, tokens), authorization and
workspace isolation, the public API and its rate limits, the coin-logo proxy, secrets handling,
and the desktop release/updater artifacts.

Out of scope: findings that require the device or account to be already compromised, missing
hardening headers with no demonstrated impact, and scanner output without a proof of concept.

## Safe harbour

Good-faith research on your own account and workspace is welcome. Do not run denial-of-service
tests, do not touch other users' data, and do not publish details before a fix ships.
