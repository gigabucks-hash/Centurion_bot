# Agen di komputer ini (MCP)

Centurion Trade bisa dijalankan oleh agen AI di laptop Anda. Agen berbicara lewat MCP. Aplikasi web harus sudah menyala (`Start-Centurion-Web.cmd`).

Agen bisa trading kertas sepenuhnya. Setelah Anda menyalakan Real di Pengaturan dan menandatangani sekali dengan Phantom, agen juga bisa membeli, menjual, jual semua, dan mengubah batas (naik atau turun) langsung. Tidak ada antrean persetujuan per perintah.

Yang tetap ditolak:

- Membaca atau mengekspor kunci privat. Kunci tetap di Phantom.
- Mengirim SOL atau token ke wallet lain. Yang ada hanya beli/jual di buku lokal, di dalam wallet Anda.
- HTTP selain di komputer ini (`127.0.0.1`), dan hanya dengan token yang dibuat di laptop.

Setiap panggilan tercatat di Pengaturan → Agen di komputer ini. Saklar di sana mematikan semua agen sekaligus.

## Menyalakan

1. Klik `Start-Centurion-Web.cmd` dan biarkan aplikasi berjalan.
2. Buka aplikasi sekali. Berkas `.local-web\mcp.token` dibuat otomatis. Jangan salin berkas itu ke git.
3. Pasang dependensi web kalau belum (`apps\web` sudah dipasang oleh peluncur).

Perintah stdio (cocok untuk Cursor dan Claude Desktop):

```bat
node --experimental-strip-types C:\Centurion\apps\web\mcp\stdio.ts
```

Ganti `C:\Centurion` dengan folder proyek Anda.

HTTP lokal (opsional), hanya `127.0.0.1`:

```bat
set CENTURION_LOCAL_DIR=C:\Centurion\.local-web
node --experimental-strip-types C:\Centurion\apps\web\mcp\http.ts
```

Lalu klien mengirim `Authorization: Bearer` isi `mcp.token`. Port bawaan `3210`, jalur `/mcp`.

## Cursor

Berkas `%USERPROFILE%\.cursor\mcp.json`:

```json
{
  "mcpServers": {
    "centurion": {
      "command": "node",
      "args": ["--experimental-strip-types", "C:\\Centurion\\apps\\web\\mcp\\stdio.ts"],
      "env": {
        "CENTURION_LOCAL_DIR": "C:\\Centurion\\.local-web",
        "CENTURION_WEB_URL": "http://127.0.0.1:3100"
      }
    }
  }
}
```

## Claude Desktop

Berkas `%APPDATA%\Claude\claude_desktop_config.json`, bagian `mcpServers` sama seperti contoh Cursor di atas.

## Alat

| Nama | Fungsi |
|---|---|
| `centurion_status` | Sehat atau tidak, jeda beli, Real nyala atau mati |
| `centurion_engine_stop` | Jeda beli baru. Posisi terbuka tetap |
| `centurion_engine_start` | Lanjutkan beli |
| `centurion_list_positions` | Posisi terbuka, kertas atau real |
| `centurion_pnl` | PnL kertas dan baris yang sudah tutup |
| `centurion_team_scores` | Skor Scout, Guard, Smart Money, Momentum, Narrative, Risk. Modul yang tidak dihitung di buku lokal ditandai tidak tersedia, bukan angka palsu |
| `centurion_paper_buy` | Beli kertas |
| `centurion_paper_sell` | Jual satu posisi kertas |
| `centurion_sell_all` | Jual semua (kertas, atau real jika Real sudah nyala) |
| `centurion_real_buy` | Beli real. Ditolak jika Real belum dinyalakan di aplikasi |
| `centurion_real_sell` | Jual satu posisi real |
| `centurion_get_settings` | Batas, RPC, saklar agen |
| `centurion_update_settings` | Ubah batas, TP/SL, filter angka, atau RPC. Naik dan turun langsung berlaku setelah Real nyala |

Sumber `centurion://config` dan prompt `daily_report` juga tersedia.

## Saklar mati

Pengaturan → Agen di komputer ini → matikan. Panggilan berikutnya ditolak, kecuali status yang memberitahu bahwa agen mati.
