# Brand assets (third-party, unmodified)

- `google/g-logo.svg`: the standard-colour "G" from Google's pre-approved sign-in assets
  (https://developers.google.com/static/identity/images/signin-assets.zip, "Android + Web / SVG / Light /
  Show text=No, Shape=Square"), button background and stroke removed, logo paths and size (20 px) unchanged,
  per https://developers.google.com/identity/branding-guidelines. Used only inside the custom
  "Continue with Google" button when the Google Identity Services button is not rendered (mock build).
- Apple: not stored here. The Sign in with Apple button image is requested at runtime from Apple's official
  button endpoint (appleid.cdn-apple.com/appleid/button, configurator at
  https://appleid.apple.com/signinwithapple/button), localized via `locale`.
- Telegram: hidden behind NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED (off); the Telegram Login library renders its own
  button when enabled.
