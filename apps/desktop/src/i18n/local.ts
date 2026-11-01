/**
 * App-local copy. Since @sentra/i18n 0.4.4 every former `desktop.*` string is a package key
 * (see packages/i18n/key-migrations.json); the only thing left here is the "(mock)" dev suffix,
 * which UX keeps app-local on purpose (it describes this prototype build, not the product).
 */
export const MOCK_SUFFIX = "(mock)";

/**
 * Templates for activity rows whose keys @sentra/i18n 0.4.7 does not ship yet (UX gap, requested as
 * `feed.event.fill` / `feed.event.exit_triggered` / `feed.event.proposal_pending`, and the desktop
 * SIWS screens `desktop.auth.*` incl. wallet_not_allowed — 0.4.7 has only the web wallet-connect copy). Used only when the package has no such key, so a
 * later package version replaces them without a code change. All numbers inside are formatted by
 * format.mjs in the UI locale (D10).
 */
export const LOCAL_TEMPLATES: Record<"en" | "id", Record<string, string>> = {
  en: {
    "feed.event.fill": "Paper {side} {amount_lamports} @ {price} SOL · fee {fee} · slippage {slip}",
    "feed.event.exit_triggered": "{rule} · sell {portion} @ {price} SOL",
    "feed.event.proposal_pending": "Proposal waiting for approval",
    "desktop.auth.title": "Sign in to {app}",
    "desktop.auth.browser_note": "Sign-in opens in your browser. Your wallet signs a message there, never inside this app.",
    "desktop.auth.waiting": "Waiting for the browser… Finish signing in there, then come back.",
    "desktop.auth.failed": "Sign-in did not complete ({code}). Try again.",
    "desktop.auth.session_ended": "Your session ended ({reason}). Sign in again.",
    "desktop.auth.not_allowed.title": "This wallet is not allowed",
    "desktop.auth.not_allowed.body": "{app} is private. Only the owner wallet can sign in. {address}",
    "desktop.auth.try_other": "Use another wallet",
    "desktop.auth.sign_out": "Sign out",
  },
  id: {
    "feed.event.fill": "Paper {side} {amount_lamports} @ {price} SOL · biaya {fee} · slippage {slip}",
    "feed.event.exit_triggered": "{rule} · jual {portion} @ {price} SOL",
    "feed.event.proposal_pending": "Proposal menunggu approval",
    "desktop.auth.title": "Masuk ke {app}",
    "desktop.auth.browser_note": "Login dibuka di browser. Wallet menandatangani pesan di sana, tidak pernah di dalam aplikasi ini.",
    "desktop.auth.waiting": "Menunggu browser… Selesaikan login di sana, lalu kembali ke sini.",
    "desktop.auth.failed": "Login belum selesai ({code}). Coba lagi.",
    "desktop.auth.session_ended": "Sesi berakhir ({reason}). Masuk lagi.",
    "desktop.auth.not_allowed.title": "Wallet ini tidak diizinkan",
    "desktop.auth.not_allowed.body": "{app} bersifat privat. Hanya wallet pemilik yang bisa masuk. {address}",
    "desktop.auth.try_other": "Pakai wallet lain",
    "desktop.auth.sign_out": "Keluar",
  },
};

