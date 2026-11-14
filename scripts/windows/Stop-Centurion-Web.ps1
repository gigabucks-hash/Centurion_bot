#Requires -Version 5.1
$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$pidFile = Join-Path $repo ".local-web\web.pid"

if (-not (Test-Path $pidFile)) {
  Write-Host "Aplikasi tidak sedang berjalan (tidak ada catatan proses)."
  exit 0
}

$pidValue = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pidValue) {
  $proc = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
  if ($proc) {
    Stop-Process -Id $pidValue -Force
    Write-Host "Aplikasi dihentikan."
  } else {
    Write-Host "Prosesnya sudah tidak ada."
  }
}
Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
Write-Host "Selesai. Data kertas di folder .local-web tetap tersimpan."
