# Coin logos on mobile (contracts 1.1.6, proxy @ backend d4dcc51)

App-side notes for `lib/core/widgets/coin_avatar.dart` and `CoinLogo` (`lib/data/models/models.dart`). UX's spec is
`ux-solbot/docs/COIN_LOGO.md`; this file records what the app does and why.

## Request size
- Sizes the proxy accepts: **48 / 64 / 96 / 128 / 192** (`services/backend/api/src/logo/transcode.ts` `LOGO_SIZES`;
  any other `s` → `422 VALIDATION_FAILED {field: "s"}`). WebP by default, PNG fallback, **never SVG**.
- `s` = the smallest of those ≥ `ceil(logical px × devicePixelRatio)`, max 192. Examples: 20 px @2× = 48,
  24 px @2.75× = 96, 32 px @3× = 96, 40 px @3× = 128, 48 px @3× = 192.
- Decode: `cacheWidth = cacheHeight = s` (`ResizeImage`), so nothing is decoded above 192 px.
- Fallback: if a 128/192 request gets a 4xx other than 404, the avatar retries the same logo at **96** (not the
  identicon). If 96 works, the session caps every request at 96 (an older proxy without the big sizes). If 96 also
  fails, it was the logo (`LOGO_REJECTED` is 422 too, and an image response carries no error body), so the cap is
  restored and that `mint+v` shows the identicon for the rest of the session.
- Each variant is hard-capped at 16 KiB by the proxy, so the client does not check byte sizes itself.

## Origin
- The logo host defaults to the API origin (`apiBaseUrlProvider`). `logo_url` is used only when it is a proxy URL
  (`/v1/img/coin/{same mint}`, https, no userinfo or fragment) on the API origin or on an origin listed in
  `logoOriginsProvider`. That allowlist is empty by default; add Backend's `LOGO_PUBLIC_BASE_URL` origin if it is
  ever set. The query string is always rebuilt (`s`, `v = logo_hash`).
- No `logo_hash` → identicon, no request.

## Push
`PushMessage.mint` / `.logoHash` are parsed when present and well-formed (contracts follow-up). Notification rows
then show a 20 px avatar. Until Backend sends them, notification rows have no avatar.
