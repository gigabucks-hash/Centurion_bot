# Centurion Trade di laptop Windows

Ini cara menjalankan aplikasi web di komputer Anda sendiri. Tidak ada server sewaan, tidak ada Postgres, dan tidak ada biaya RPC. Kunci wallet tidak pernah disimpan oleh aplikasi.

Tombol dua kali klik: `Start-Centurion-Web.cmd` di folder proyek.

## 1. Ambil kodenya

Pilih salah satu.

**ZIP**

1. Di GitHub, pilih Code, lalu Download ZIP.
2. Ekstrak zipnya. Misalnya ke `C:\Centurion`.
3. Masuk ke folder yang ada file `Start-Centurion-Web.cmd`.

**Git** (kalau Git sudah terpasang)

```bat
git clone https://github.com/gigabucks-hash/Centurion_bot.git
cd Centurion_bot
```

## 2. Klik dua kali

Klik `Start-Centurion-Web.cmd`.

Pertama kali, jendela hitam akan:

1. Memeriksa Node.js. Kalau belum ada, memasangnya dari winget (Node.js LTS resmi). Windows mungkin meminta izin. Pilih Ya.
2. Memeriksa Git. Git tidak wajib. Kalau belum ada, skrip mencoba memasangnya supaya pembaruan lebih mudah.
3. Mengunduh paket aplikasi (butuh internet, hanya di awal).
4. Membangun aplikasi.
5. Membuka browser di `http://127.0.0.1:3100/`.

Perkiraan waktu: **5–10 menit** pertama kali. Berikutnya biasanya **di bawah 1 menit**. Kalau kodenya baru diubah, pembangunan ulang sekitar **1–3 menit**.

npm sudah ikut Node.js. pnpm tidak dipakai. Postgres tidak dipasang.

## 3. Yang akan terlihat

Layar masuk punya dua jalan:

- **Hubungkan Phantom** — ekstensi Phantom di browser (pasang dari situs resmi Phantom). Ini tanda tangan pesan masuk. Bukan transaksi, dan tanpa biaya.
- **Lanjut mode kertas di komputer ini** — tanpa wallet. Cocok untuk latihan.

Mode kertas: setujui, jual, jeda beli, dan strategi berjalan di komputer ini. Angkanya tersimpan di folder `.local-web`. Itu bukan SOL sungguhan.

**Real** di Pengaturan:

- Mati sampai Anda menandatangani dengan Phantom.
- Nilai awal: 0,05 SOL per trade, 0,5 SOL per hari, batas 2 SOL, 3 posisi.
- Tidak ada angka maksimum.
- Angka yang lebih kecil langsung tersimpan.
- Angka yang lebih besar menampilkan teks lama dan baru, lalu Phantom menandatangani.
- Aplikasi tidak pernah mengekspor atau menyimpan kunci.
- Aplikasi web lokal ini **tidak mengirim swap ke jaringan**. Menyalakan Real hanya menyimpan batas dan tanda tangan.

Tema mengikuti pengaturan Windows (gelap atau terang) sampai Anda memilih sendiri. Pilihan itu diingat.

## 4. Memperbarui

1. Kalau pakai git: di folder proyek, `git pull`.
2. Kalau pakai ZIP: unduh ZIP baru dan ekstrak di atas folder lama. Jangan hapus folder `.local-web` kalau Anda ingin data kertas tetap ada.
3. Klik `Start-Centurion-Web.cmd` lagi. Kalau ada berkas yang berubah, aplikasi dibangun ulang sendiri.

## 5. Berhenti

Klik `Stop-Centurion-Web.cmd`.

Menutup browser tidak mematikan aplikasi. Menutup jendela hitam peluncur juga tidak mematikannya.

## 6. Kalau ada masalah

| Yang terjadi | Yang dilakukan |
|---|---|
| Windows meminta izin saat memasang Node | Pilih Ya. Itu pemasang resmi lewat winget. |
| "winget tidak ditemukan" | Pasang Node.js LTS dari https://nodejs.org lalu klik peluncur lagi. |
| Node sudah dipasang tapi masih gagal | Tutup jendela, buka lagi, klik peluncur sekali lagi supaya PATH terbaca. |
| Halaman tidak terbuka | Pastikan tidak ada program lain di port 3100. Klik Stop, lalu Start. |
| Phantom tidak muncul | Pasang ekstensi Phantom di browser yang Anda pakai, lalu muat ulang halaman. Mode kertas tetap bisa lewat tombol kedua. |
| Laptop tidur atau tertutup | Aplikasi berhenti bersama Windows. Setelah bangun, klik Start lagi. Data kertas di `.local-web` tetap ada. Anda masuk lagi. |
| Ingin mulai kertas dari nol | Hentikan aplikasi, hapus folder `.local-web`, lalu Start lagi. |

Pemutar desktop yang ditolak Smart App Control adalah berkas lain. Peluncur ini hanya membuka situs lokal di browser, jadi tidak memakai pemasang itu.
