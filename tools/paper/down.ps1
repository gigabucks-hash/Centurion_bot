<#
.SYNOPSIS
  Stop the local paper stack started by tools\paper\up.ps1.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$stateFile = Join-Path $repo ".paper\state.json"

if (-not (Test-Path $stateFile)) {
  Write-Host "nothing to stop: .paper\state.json not found."
  exit 0
}

$state = Get-Content $stateFile -Raw | ConvertFrom-Json
foreach ($entry in @(@{ name = "web"; id = $state.webPid }, @{ name = "api"; id = $state.apiPid })) {
  $proc = Get-Process -Id $entry.id -ErrorAction SilentlyContinue
  if (-not $proc) { Write-Host "$($entry.name): not running (pid $($entry.id))"; continue }
  # Refuse to kill a recycled pid that is no longer ours.
  $cmd = (Get-CimInstance Win32_Process -Filter "ProcessId = $($entry.id)" -ErrorAction SilentlyContinue).CommandLine
  if ($cmd -and $cmd -notmatch "next|main\.ts") {
    Write-Host "$($entry.name): pid $($entry.id) is not the paper stack (skip)"
    continue
  }
  Stop-Process -Id $entry.id -Force
  Write-Host "$($entry.name): stopped (pid $($entry.id))"
}

Remove-Item $stateFile -Force -ErrorAction SilentlyContinue
Write-Host "paper stack stopped."