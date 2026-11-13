#Requires -Version 5.1
<#
.SYNOPSIS
  Menyalakan Centurion Trade di browser komputer ini.

.DESCRIPTION
  Tidak memakai Postgres, tidak menyewa server, dan tidak menyimpan kunci wallet.
  Mode kertas berjalan di aplikasi web. Real hanya menyala setelah Phantom menandatangani.
#>
[CmdletBinding()]
param(
  [int]$Port = 3100,
  [switch]$Rebuild
)

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$web = Join-Path $repo "apps\web"
$state = Join-Path $repo ".local-web"
$pidFile = Join-Path $state "web.pid"

function Say([string]$Message) { Write-Host $Message }
function Fail([string]$Message) {
  Write-Host ""
  Write-Host "GAGAL: $Message" -ForegroundColor Red
  Write-Host "Bantuan ada di docs\web-local-windows.md"
  exit 1
}

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  if ($machine -or $user) { $env:Path = "$machine;$user" }
  foreach ($extra in @(
    "$env:ProgramFiles\nodejs",
    "$env:LocalAppData\Programs\nodejs"
  )) {
    if ($extra -and (Test-Path $extra)) { $env:Path = "$extra;$env:Path" }
  }
}

function Find-Node {
  Refresh-Path
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($candidate in @(
    "$env:ProgramFiles\nodejs\node.exe",
    "$env:LocalAppData\Programs\nodejs\node.exe"
  )) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  return $null
}

Say "Centurion Trade — aplikasi web di komputer ini"
Say "Mode kertas tidak memakai Postgres. Kunci wallet tidak pernah disimpan."
Say "Pertama kali bisa sekitar 5–10 menit. Berikutnya biasanya di bawah 1 menit, atau 1–3 menit jika kodenya berubah."
Say ""

$node = Find-Node
$major = 0
if ($node) {
  $ver = & $node -p "process.versions.node"
  $major = [int]($ver.Split(".")[0])
}
if (-not $node -or $major -lt 22) {
  Say "Node.js 22 atau yang lebih baru belum ada. Memasang Node.js LTS dari winget (OpenJS, sumber resmi)..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Fail "winget tidak ditemukan. Pasang Node.js LTS dari https://nodejs.org lalu klik file ini lagi."
  }
  & winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --disable-interactivity
  if ($LASTEXITCODE -ne 0) {
    Fail "Pemasangan Node.js gagal. Pasang Node.js LTS dari https://nodejs.org lalu klik file ini lagi."
  }
  $node = Find-Node
  if (-not $node) { Fail "Node.js terpasang, tetapi jendela ini belum melihatnya. Tutup jendela, buka lagi, lalu klik file peluncur sekali lagi." }
  Say "Node.js sudah terpasang."
}

$git = Get-Command git -ErrorAction SilentlyContinue
if (-not $git) {
  Say "Git belum ada. Git tidak wajib untuk menjalankan aplikasi. Mencoba memasang dari winget (Git, sumber resmi) supaya pembaruan lewat git lebih mudah..."
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if ($winget) {
    & winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements --disable-interactivity
    if ($LASTEXITCODE -ne 0) {
      Say "Git tidak terpasang. Aplikasi tetap dijalankan. Untuk memperbarui lewat git, pasang dari https://git-scm.com"
    }
  } else {
    Say "winget tidak ada, jadi Git tidak dipasang. Aplikasi tetap dijalankan."
  }
}

Say "npm sudah ikut Node.js. pnpm tidak diperlukan."

if (Test-Path $pidFile) {
  $old = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($old -and (Get-Process -Id $old -ErrorAction SilentlyContinue)) {
    Say "Aplikasi sudah berjalan. Membuka browser."
    Start-Process "http://127.0.0.1:$Port/"
    exit 0
  }
}

Say "Memeriksa paket aplikasi..."
$lock = Join-Path $web "package-lock.json"
$installed = Join-Path $web "node_modules\.package-lock.json"
$needInstall = -not (Test-Path (Join-Path $web "node_modules"))
if ((Test-Path $lock) -and (Test-Path $installed)) {
  if ((Get-Item $lock).LastWriteTimeUtc -gt (Get-Item $installed).LastWriteTimeUtc) { $needInstall = $true }
}
if ($needInstall) {
  Say "Memasang dependensi. Ini hanya di awal, dan butuh internet."
  Push-Location $web
  try {
    & npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Fail "npm ci gagal. Periksa koneksi internet, lalu klik file ini lagi." }
  } finally { Pop-Location }
}

function Needs-Build {
  if ($Rebuild) { return $true }
  $buildId = Join-Path $web ".next\BUILD_ID"
  $server = Join-Path $web ".next\standalone\apps\web\server.js"
  if (-not (Test-Path $buildId) -or -not (Test-Path $server)) { return $true }
  $stamp = (Get-Item $buildId).LastWriteTimeUtc
  $files = @(
    (Join-Path $web "package-lock.json"),
    (Join-Path $web "package.json"),
    (Join-Path $web "next.config.ts")
  )
  foreach ($file in $files) {
    if ((Test-Path $file) -and (Get-Item $file).LastWriteTimeUtc -gt $stamp) { return $true }
  }
  $dirs = @(
    (Join-Path $web "app"),
    (Join-Path $web "lib"),
    (Join-Path $web "components"),
    (Join-Path $repo "packages\contracts"),
    (Join-Path $repo "packages\i18n"),
    (Join-Path $repo "packages\design-tokens")
  )
  foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) { continue }
    $hit = Get-ChildItem $dir -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.next\\' -and $_.LastWriteTimeUtc -gt $stamp } |
      Select-Object -First 1
    if ($hit) { return $true }
  }
  return $false
}

if (Needs-Build) {
  Say "Membangun aplikasi. Pertama kali ini bagian yang paling lama."
  $env:NODE_ENV = "production"
  $env:NEXT_TELEMETRY_DISABLED = "1"
  $env:NEXT_PUBLIC_SITE_URL = "http://127.0.0.1:$Port"
  Push-Location $web
  try {
    & npm run build
    if ($LASTEXITCODE -ne 0) { Fail "Pembangunan aplikasi gagal. Gulir ke atas untuk melihat pesan merah." }
  } finally { Pop-Location }
} else {
  Say "Bangunan aplikasi masih baru. Melewati pembangunan."
}

$standalone = Join-Path $web ".next\standalone"
$serverJs = Join-Path $standalone "apps\web\server.js"
if (-not (Test-Path $serverJs)) { Fail "Berkas server tidak ditemukan. Hapus folder apps\web\.next lalu klik file ini lagi." }
$standaloneApp = Join-Path $standalone "apps\web"
New-Item -ItemType Directory -Force -Path (Join-Path $standaloneApp ".next") | Out-Null
Copy-Item (Join-Path $web ".next\static") (Join-Path $standaloneApp ".next\static") -Recurse -Force
if (Test-Path (Join-Path $web "public")) {
  Copy-Item (Join-Path $web "public") (Join-Path $standaloneApp "public") -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $state | Out-Null
$log = Join-Path $state "web.log"

$env:NODE_ENV = "production"
$env:CENTURION_LOCAL = "1"
$env:CENTURION_LOCAL_DIR = $state
$env:CENTURION_INSECURE_COOKIES = "1"
$env:PORT = "$Port"
$env:HOSTNAME = "127.0.0.1"
$env:NEXT_TELEMETRY_DISABLED = "1"
Remove-Item Env:DATA_SOURCE -ErrorAction SilentlyContinue
Remove-Item Env:API_BASE_URL -ErrorAction SilentlyContinue

Say "Menyalakan aplikasi di http://127.0.0.1:$Port ..."
$proc = Start-Process -FilePath $node -ArgumentList @($serverJs) -WorkingDirectory $web `
  -RedirectStandardOutput $log -RedirectStandardError "$log.err" -WindowStyle Hidden -PassThru
Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii

$deadline = (Get-Date).AddSeconds(90)
$up = $false
while ((Get-Date) -lt $deadline) {
  try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/login" -UseBasicParsing -TimeoutSec 5
    if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { $up = $true; break }
  } catch {
    Start-Sleep -Milliseconds 700
  }
}
if (-not $up) {
  Write-Host "--- cuplikan log ---" -ForegroundColor Yellow
  Get-Content "$log.err" -Tail 30 -ErrorAction SilentlyContinue
  Fail "Aplikasi tidak menjawab. Lihat file .local-web\web.log.err"
}

Start-Process "http://127.0.0.1:$Port/"
Say ""
Say "Siap. Browser membuka http://127.0.0.1:$Port/"
Say "Untuk mode kertas tanpa Phantom, pilih tombol lanjut mode kertas."
Say "Real tetap mati sampai Phantom menandatangani di Pengaturan."
Say "Untuk berhenti: klik Stop-Centurion-Web.cmd"
Say "Menutup jendela ini tidak mematikan aplikasi."
