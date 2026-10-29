import type { PartialMessages } from "./index.ts";

/**
 * Indonesian scaffold (partial). Missing keys fall back to English at runtime.
 * Notification strings are taken from /workspace/ux-solbot/docs/NOTIFICATIONS.md (column "Judul + isi (ID)").
 * Everything else is a first pass and needs review by a native speaker / UX writer.
 */
export const id: PartialMessages = {
  common: {
    loading: "Memuat…", cancel: "Batal", cancelEsc: "Batal (Esc)", close: "Tutup", back: "Kembali", next: "Lanjut",
    on: "Aktif", off: "Mati", all: "Semua", allStrategies: "Semua strategi", strategy: "Strategi", details: "detail ›", seeAll: "Semua ›",
    restore: "Pulihkan", discard: "Buang", releaseCancel: "Lepas = batal.", holdSeconds: "Tahan {s} dtk. Lepas = batal.",
    up: "naik", down: "turun", flat: "datar", profitSr: "untung: ", lossSr: "rugi: ", expiresIn: "Kedaluwarsa dalam {time}",
    closeDialog: "Tutup dialog", language: "Bahasa", mockBuild: "Build data mock · tanpa wallet, RPC atau akses chain",
  },
  mode: {
    practiceShort: "Practice", realShort: "Real SOL",
    bannerPractice: "◇ PRACTICE · SOL kertas — tidak ada SOL nyata yang bergerak",
    bannerRealConnected: "● REAL SOL · wallet terhubung — order memakai SOL nyata",
    bannerRealMock: "● REAL SOL · build mock — tidak ada wallet, tidak ada yang dikirim ke chain",
    switchTitle: "Pindah ke Real SOL?",
    holdToSwitch: "Tahan untuk pindah ke Real SOL",
    holdHint: "Tahan 2,5 dtk. Lepas untuk batal.",
    stayPractice: "Tetap di Practice (Esc)",
    // N-14
    nowReal: "Sekarang di REAL SOL · Order berikutnya memakai SOL nyata",
    backPractice: "Kembali ke PRACTICE",
  },
  nav: {
    dashboard: "Dasbor", strategies: "Strategi", approvals: "Approval", activity: "Aktivitas", coins: "Koin", stats: "Statistik exit",
    homeShort: "Beranda", statsShort: "Statistik", more: "Lainnya", pending: "{n} menunggu",
    search: "⌘K Cari koin / strategi", searchLabel: "Cari koin atau strategi", signOut: "Keluar (mock)",
    themeTo: "Ganti ke tema {theme}", themeDark: "gelap", themeLight: "terang",
  },
  conn: {
    connected: "Live", connecting: "Menghubungkan…", disconnected: "Offline", title: "Stream realtime: {state}",
    // N-16
    lost: "Koneksi ke server terputus · Data mungkin tertunda. Mencoba lagi…",
  },
  status: { draft: "Draf", running: "Berjalan", paused: "Dijeda", stopped: "Berhenti", archived: "Diarsipkan" },
  approvalMode: {
    off: "Mati (otomatis)", ask_first_buy: "Tanya sebelum buy pertama", ask_every_buy: "Tanya sebelum setiap buy", perStrategy: "Per strategi",
    offRealNote: "Mati tidak tersedia untuk strategi Real SOL.",
  },
  // N-07a..d
  expiredReason: {
    timeout: "Waktu approval habis", strategy_deleted: "Strategi dihapus", strategy_archived: "Strategi diarsipkan",
    guard_failed: "Guard gagal saat menunggu", price_moved: "Harga naik melewati batas entry",
  },
  feed: { all: "Semua", buys: "Buy", sells: "Sell", guard: "Guard", proposals: "Proposal", pause: "Jeda", resume: "Lanjut", paused: "dijeda" },
  overview: { title: "Ringkasan tim", cash: "Kas", realized: "PnL terealisasi", openPositions: "Posisi terbuka", waiting: "Menunggu approval", strategies: "Strategi", newStrategy: "Strategi baru", activity: "Feed aktivitas", warnings: "Peringatan" },
  approvals: {
    title: "Antrean approval", tabPending: "Menunggu", tabActive: "Diproses", tabDone: "Selesai", tabExpired: "Kedaluwarsa",
    skip: "Lewati", approve: "Setujui", review: "Tinjau", skipKey: "Lewati (S)", approveKey: "Setujui (A)", reviewKey: "Tinjau (Enter)",
    // N-02, N-01, N-03, N-06, N-11, N-12
    firstBuyNote: "Strategi ini belum pernah beli. Cek sebelum mulai",
    cardAria: "{coin} menunggu approval · {strategy} · {sol} · sisa {time}",
    approvedToast: "Disetujui: {coin} · Order sedang diproses",
    skippedToast: "Dilewati: {coin}",
    skippedReason: "Dilewati: {coin} · Alasan: {reason}",
    undo: "Urungkan",
    cooldownToast: "[REAL SOL] Guard dilonggarkan dalam 10 mnt · {strategy}: berlaku {time}. Batalkan bila bukan kamu",
    appliedPractice: "[PRACTICE] Guard {strategy} kini lebih longgar",
    autoReverts: " · auto-revert {time}",
    cancelChange: "Batalkan perubahan",
  },
  builder: {
    // N-10
    guardPending: "[{mode}] Perubahan guard menunggu · {strategy}: melonggarkan guard",
  },
  guardDialog: { ruleRevert: "Auto-revert 24 jam setelah berlaku (selalu aktif untuk Real SOL)" },
  login: { title: "Masuk", heading: "Masuk atau buat akun", or: "atau", email: "Email" },
  notFound: { title: "Tidak ditemukan", back: "Kembali ke dasbor" },
};
