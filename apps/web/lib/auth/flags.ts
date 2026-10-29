/**
 * Sign-in feature flags (Boss decision via Apex, 29 Oct 2026): the MVP is a private, single-owner app and signs in
 * with a Solana wallet only (Phantom, SIWS). The other methods stay in the code behind flags that are OFF unless
 * explicitly set to "true" at build time. Nothing here is a secret.
 */
const on = (v: string | undefined) => v === "true";

export const AUTH_FLAGS = {
  emailOtp: on(process.env.NEXT_PUBLIC_AUTH_EMAIL_OTP_ENABLED),
  google: on(process.env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED),
  apple: on(process.env.NEXT_PUBLIC_AUTH_APPLE_ENABLED),
  telegram: on(process.env.NEXT_PUBLIC_AUTH_TELEGRAM_OIDC_ENABLED),
  /** Multi-user onboarding (/welcome presets). Off: private app, no sign-up copy. */
  onboarding: on(process.env.NEXT_PUBLIC_AUTH_ONBOARDING_ENABLED),
} as const;

export const anyLegacyMethod = () => AUTH_FLAGS.emailOtp || AUTH_FLAGS.google || AUTH_FLAGS.apple || AUTH_FLAGS.telegram;
