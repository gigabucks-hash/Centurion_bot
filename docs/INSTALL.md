# Install Centurion Trade 1.0.0

Paper trading works on one computer. You do not need a VPS. Real trading stays off until you sign with Phantom inside the app. The default RPC is the public Solana endpoint. Paste your own in Settings if you have one.

The installers are unsigned. Windows will ask you to confirm. That is expected.

## Windows

1. Download the NSIS `.exe` or the `.msi` from the workflow artifacts named `centurion-trade-windows`.
2. Run the installer. If SmartScreen warns you, choose More info, then Run anyway. The build is not code-signed.
3. Open Centurion Trade. The first screen explains paper mode. Stay on paper until you are ready.
4. Real: Settings, sign the enable message with Phantom, then set your limits. Raising a limit asks for another signature. Stop pauses new buys. Jual semua sells open positions. Nothing in the app sends SOL to another wallet.

## Linux

Download `centurion-trade-linux`.

- AppImage: `chmod +x Centurion*.AppImage` and run it. WebKitGTK 4.1 is required on the machine.
- deb: `sudo apt install ./centurion-trade_*.deb`

The same paper / Real rules as Windows apply.

## Web

The Docker image is the artifact `centurion-trade-web` (`centurion-web.tar.gz`).

```bash
docker load < centurion-web.tar.gz
docker run --rm -p 3100:3100 centurion-web:ci
```

Open http://127.0.0.1:3100 . Sign in with the wallet allowlist when `DATA_SOURCE=http`. The mock build is for a private demo: a random cookie is not a session.

To build it yourself, from the repository root:

```bash
docker build -f apps/web/Dockerfile -t centurion-web:ci .
```

Do not set `CENTURION_AUTH_GATE=0` on a machine other people can reach. Production ignores that switch.

## Bahasa Indonesia

Mode kertas adalah bawaan, di satu komputer, tanpa VPS. Mode Real mati sampai Anda menandatangani dengan Phantom di dalam aplikasi. RPC bawaan adalah RPC publik Solana. Tempel RPC Anda sendiri di Pengaturan bila ada.

Pemasang tidak ditandatangani. Windows akan meminta konfirmasi. Itu memang begitu.

### Windows

1. Unduh `.exe` (NSIS) atau `.msi` dari artefak `centurion-trade-windows`.
2. Jalankan pemasang. Jika SmartScreen memperingatkan, pilih More info lalu Run anyway.
3. Buka Centurion Trade. Layar pertama menjelaskan mode kertas.
4. Real: Pengaturan, tandatangani pesan aktifkan dengan Phantom, lalu atur batas. Menaikkan batas meminta tanda tangan lagi. Stop menjeda pembelian baru. Jual semua menjual posisi terbuka. Aplikasi tidak mengirim SOL ke wallet lain.

### Linux

Unduh `centurion-trade-linux`. AppImage perlu `chmod +x`. Paket deb dipasang dengan `sudo apt install ./centurion-trade_*.deb`. Butuh WebKitGTK 4.1.

### Web

Artefak `centurion-trade-web` adalah citra Docker.

```bash
docker load < centurion-web.tar.gz
docker run --rm -p 3100:3100 centurion-web:ci
```

Buka http://127.0.0.1:3100 . Jangan memasang `CENTURION_AUTH_GATE=0` di mesin yang bisa dijangkau orang lain. Proses produksi mengabaikan sakelar itu.
