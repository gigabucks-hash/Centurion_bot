/**
 * C19 test gate (runtime OS check, mirrors `windows::POPUP_SUPPORTED` cfg in Rust, which is the
 * real enforcement). The no-activation popup is verified on Linux only. The supported Windows
 * desktop target stays disabled until MILESTONES W-NOFOCUS passes. macOS is not a supported target.
 */
const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
export const popupSupported = /Linux/i.test(ua) && !/Android/i.test(ua);
export const POPUP_DISABLED_REASON =
  "Belum tersedia di Windows: popup harus lulus tes \"tidak mencuri fokus\" (W-NOFOCUS) dulu. Sementara pakai notifikasi OS.";
