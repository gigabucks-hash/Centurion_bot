<#
.SYNOPSIS
  Start the whole Centurion paper stack (Postgres schema + paper API + web) with one command.

.DESCRIPTION
  Paper only: the API refuses to start unless TRADING_MODE=paper, and Real stays locked in the product.
  Nothing here deploys, signs, or touches a chain.

  Steps:
    1. Create the database if missing and apply the Supabase local shim + migrations 0001..NNNN.
    2. Generate (once) and reuse the two API secrets, so restarts keep existing sessions/workspaces valid.
    3. Start the paper API (services/backend/api) on -ApiPort.
    4. Start the built Next app (apps/web) in DATA_SOURCE=http on -WebPort.
    5. Wait until both answer, then print the local URL and the LAN URL a phone can open.

  Logs:  .paper/logs/api.log, .paper/logs/web.log
  State: .paper/state.json  (used by down.ps1)

.PARAMETER OwnerWallet
  Your Phantom public key (base58). SIWS fails closed without it. The API only lets this wallet in.

.PARAMETER Reset
  Drop and recreate the database (all paper history is lost).

.PARAMETER PgPassword
  Password for the local Postgres superuser. Defaults to $env:PGPASSWORD.

.EXAMPLE
  $env:PGPASSWORD = "postgres"
  .\tools\paper\up.ps1 -OwnerWallet 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU

.EXAMPLE
  .\tools\paper\down.ps1
#>
[CmdletBinding()]
param(
  [string]$OwnerWallet = $env:OWNER_WALLETS,
  [string]$DbName = "centurion_paper",
  [int]$ApiPort = 8080,
  [int]$WebPort = 3100,
  [string]$PgHost = "127.0.0.1",
  [int]$PgPort = 5432,
  [string]$PgUser = "postgres",
  [string]$PgPassword = $env:PGPASSWORD,
  [switch]$Reset,
  [switch]$Rebuild,
  [switch]$Lan,
  [switch]$NoWait
)

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$stateDir = Join-Path $repo ".paper"
$logDir = Join-Path $stateDir "logs"
$stateFile = Join-Path $stateDir "state.json"
$secretFile = Join-Path $stateDir "secrets.json"
$migrations = Join-Path $repo "services\backend\supabase\migrations"
$shim = Join-Path $repo "services\backend\supabase\tests\00_local_shim.sql"
$apiDir = Join-Path $repo "services\backend\api"
$webDir = Join-Path $repo "apps\web"

function Fail([string]$message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }
function Step([string]$message) { Write-Host "==> $message" -ForegroundColor Cyan }

if (-not $OwnerWallet) {
  Fail "pass -OwnerWallet <your Phantom public key>; the paper API refuses to start without an owner wallet."
}

# --- toolchain ----------------------------------------------------------------------------------
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source }
if (-not $node) { Fail "node is not on PATH (need Node 22.18+)." }

$psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $psql) {
  $psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName
}
if (-not $psql) { Fail "psql is not on PATH and no C:\Program Files\PostgreSQL\*\bin\psql.exe found." }
$pgBin = Split-Path -Parent $psql
$createdb = Join-Path $pgBin "createdb.exe"
$dropdb = Join-Path $pgBin "dropdb.exe"

if (Test-Path $stateFile) {
  $old = Get-Content $stateFile -Raw | ConvertFrom-Json
  $alive = @($old.apiPid, $old.webPid) | Where-Object { $_ -and (Get-Process -Id $_ -ErrorAction SilentlyContinue) }
  if ($alive.Count -gt 0) { Fail "the stack is already running (pids $($alive -join ', ')). Run .\tools\paper\down.ps1 first." }
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

# --- database -----------------------------------------------------------------------------------
if ($PgPassword) { $env:PGPASSWORD = $PgPassword }
$psqlArgs = @("-h", $PgHost, "-p", $PgPort, "-U", $PgUser)

Step "database '$DbName' on ${PgHost}:${PgPort}"
$exists = & $psql @psqlArgs -Atc "select 1 from pg_database where datname = '$DbName'" 2>&1
if ($LASTEXITCODE -ne 0) { Fail "cannot reach Postgres as '$PgUser' on ${PgHost}:${PgPort}. Set `$env:PGPASSWORD (or -PgPassword) and retry.`n$exists" }
if ($Reset -and $exists -eq "1") { & $dropdb @psqlArgs --if-exists $DbName | Out-Null; $exists = "" }
if ($exists -ne "1") { & $createdb @psqlArgs $DbName | Out-Null; Step "created database" }

$schema = & $psql @psqlArgs -d $DbName -Atc "select to_regclass('public.coins') is not null" 2>&1
if ($schema -ne "t") {
  Step "applying local shim + migrations"
  & $psql @psqlArgs -d $DbName -v ON_ERROR_STOP=1 -q -f $shim | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "shim failed (see above)." }
  Get-ChildItem $migrations -Filter *.sql | Sort-Object Name | ForEach-Object {
    & $psql @psqlArgs -d $DbName -v ON_ERROR_STOP=1 -q -f $_.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { Fail "migration $($_.Name) failed." }
  }
  Step "schema ready"
} else {
  Step "schema already present (use -Reset to recreate)"
}

# --- secrets ------------------------------------------------------------------------------------
function New-Secret([int]$length = 48) {
  # Cryptographic RNG, not Get-Random: these two values are the HMAC keys for every session and
  # JWT the local stack issues, and System.Random is seeded from the clock and predictable.
  # Rejection sampling keeps the 62-char alphabet uniform (accept 0..247, reject 248..255).
  $alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  $limit = [int]([math]::Floor(256 / $alphabet.Length) * $alphabet.Length)
  $chars = [System.Collections.Generic.List[char]]::new()
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $buf = New-Object byte[] 64
    while ($chars.Count -lt $length) {
      $rng.GetBytes($buf)
      foreach ($b in $buf) {
        if ($b -lt $limit -and $chars.Count -lt $length) { $chars.Add($alphabet[[int]$b % $alphabet.Length]) }
      }
    }
  } finally { $rng.Dispose() }
  -join $chars
}
if (Test-Path $secretFile) {
  $secrets = Get-Content $secretFile -Raw | ConvertFrom-Json
} else {
  $secrets = [pscustomobject]@{
    sessionSecret = New-Secret
    jwtSecret     = New-Secret
  }
  $secrets | ConvertTo-Json | Set-Content -Path $secretFile -Encoding utf8
  Step "generated API secrets in .paper\secrets.json (reused on every restart)"
}

# --- addresses ----------------------------------------------------------------------------------
$lanIp = (Get-NetIPConfiguration -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" -and
    $_.InterfaceAlias -notmatch "vEthernet|WSL|Hyper-V|VPN|Loopback|Bluetooth"
  } | ForEach-Object { $_.IPv4Address.IPAddress } | Select-Object -First 1)
if (-not $lanIp) {
  # No default route (e.g. offline): fall back to any non-loopback IPv4.
  $lanIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress)
}
$domains = @("localhost:$WebPort", "127.0.0.1:$WebPort")
# Listening on every interface is opt-in: plain http means anyone on the same Wi-Fi can open the app and
# read the paper history. Without -Lan both servers bind loopback only.
$bindHost = if ($Lan) { "0.0.0.0" } else { "127.0.0.1" }
if ($Lan -and $lanIp) { $domains += "${lanIp}:$WebPort" }
if ($Lan -and -not $lanIp) { Write-Host "WARN: -Lan was given but no LAN IPv4 address was found; only localhost will answer." -ForegroundColor Yellow }
if ($Lan) { Write-Host "WARN: -Lan serves plain http to the whole network; use it only on a Wi-Fi you trust." -ForegroundColor Yellow }

$dbUrl = if ($PgPassword) {
  "postgres://${PgUser}:$([uri]::EscapeDataString($PgPassword))@${PgHost}:${PgPort}/$DbName"
} else {
  "postgres://${PgUser}@${PgHost}:${PgPort}/$DbName"
}

# --- paper API ----------------------------------------------------------------------------------
Step "starting paper API on :$ApiPort"
$env:TRADING_MODE = "paper"
$env:NODE_ENV = "development"            # AUTH_USER_CREATE=direct is refused in production
$env:DATABASE_URL = $dbUrl
$env:API_HOST = "127.0.0.1"                # the web app proxies for the browser; the API never needs the LAN
$env:API_PORT = "$ApiPort"
$env:AUTH_SIWS_DOMAINS = ($domains -join ",")
$env:OWNER_WALLETS = $OwnerWallet
$env:CENTURION_SESSION_SECRET = $secrets.sessionSecret
$env:SUPABASE_JWT_SECRET = $secrets.jwtSecret
$env:AUTH_USER_CREATE = "direct"          # local only: no Supabase Admin API needed
$env:RATE_LIMIT_STORE = "memory"

$apiLog = Join-Path $logDir "api.log"
$api = Start-Process -FilePath $node -ArgumentList @("src/main.ts") -WorkingDirectory $apiDir `
  -RedirectStandardOutput $apiLog -RedirectStandardError "$apiLog.err" -WindowStyle Hidden -PassThru

# --- web ----------------------------------------------------------------------------------------
# The web build must never inherit NODE_ENV=development (the API needs it for AUTH_USER_CREATE=direct):
# a dev-env production build fails at /_global-error. Build with production env, start from the
# standalone output Next emits when `output: "standalone"` is set (plain `next start` refuses it).
$env:NODE_ENV = "production"
$env:NEXT_PUBLIC_SITE_URL = "http://localhost:$WebPort"
$buildId = Join-Path $webDir ".next\BUILD_ID"
if ($Rebuild -or -not (Test-Path $buildId)) {
  Step "building the web app (first run only, ~1-2 min)"
  Push-Location $webDir
  try {
    & (Join-Path $webDir "node_modules\.bin\next.cmd") build | Out-Host
    if ($LASTEXITCODE -ne 0) { Fail "web build failed." }
  } finally { Pop-Location }
}

$standalone = Join-Path $webDir ".next\standalone"
$serverJs = Join-Path $standalone "apps\web\server.js"
if (-not (Test-Path $serverJs)) { Fail "standalone server not found at $serverJs (run with -Rebuild)." }
# The standalone tree ships no static assets or public files: copy them like the Dockerfile does.
$standaloneApp = Join-Path $standalone "apps\web"
New-Item -ItemType Directory -Force -Path (Join-Path $standaloneApp ".next") | Out-Null
Copy-Item (Join-Path $webDir ".next\static") (Join-Path $standaloneApp ".next\static") -Recurse -Force
if (Test-Path (Join-Path $webDir "public")) {
  Copy-Item (Join-Path $webDir "public") (Join-Path $standaloneApp "public") -Recurse -Force
}

Step "starting web (DATA_SOURCE=http) on :$WebPort"
$env:DATA_SOURCE = "http"
$env:API_BASE_URL = "http://127.0.0.1:$ApiPort"
$env:CENTURION_INSECURE_COOKIES = "1"     # plain http on localhost / LAN only
$env:PORT = "$WebPort"
$env:HOSTNAME = $bindHost

$webLog = Join-Path $logDir "web.log"
$web = Start-Process -FilePath $node -ArgumentList @($serverJs) `
  -WorkingDirectory $webDir -RedirectStandardOutput $webLog -RedirectStandardError "$webLog.err" -WindowStyle Hidden -PassThru

[pscustomobject]@{
  startedAt = (Get-Date).ToString("s")
  apiPid    = $api.Id
  webPid    = $web.Id
  apiPort   = $ApiPort
  webPort   = $WebPort
  dbName    = $DbName
} | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8

function Wait-Endpoint([string]$url, [int]$timeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5 -MaximumRedirection 0 -ErrorAction Stop
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 400) { return $true }
    } catch {
      if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -lt 400) { return $true }
      Start-Sleep -Milliseconds 700
    }
  }
  return $false
}

if ($NoWait) {
  Write-Host "started (not waiting): API :$ApiPort, web :$WebPort. Logs in .paper\logs"
  exit 0
}

Step "waiting for both services"
if (-not (Wait-Endpoint "http://127.0.0.1:$ApiPort/healthz")) {
  Write-Host "--- .paper\logs\api.log.err (tail) ---" -ForegroundColor Yellow
  Get-Content "$apiLog.err" -Tail 25 -ErrorAction SilentlyContinue
  Fail "the paper API did not answer on :$ApiPort."
}
if (-not (Wait-Endpoint "http://127.0.0.1:$WebPort/login")) {
  Write-Host "--- .paper\logs\web.log.err (tail) ---" -ForegroundColor Yellow
  Get-Content "$webLog.err" -Tail 25 -ErrorAction SilentlyContinue
  Fail "the web app did not answer on :$WebPort."
}

$health = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/healthz" -TimeoutSec 5
Write-Host ""
Write-Host "Paper stack is up (mode: $($health.mode), real_enabled: $($health.real_enabled))" -ForegroundColor Green
Write-Host "  Web        http://localhost:$WebPort"
if ($Lan -and $lanIp) {
  Write-Host "  Phone/LAN  http://${lanIp}:$WebPort   (same Wi-Fi; anyone on it can open this app; Phantom may require https)" -ForegroundColor Yellow
} else {
  Write-Host "  Phone/LAN  off (loopback only); add -Lan to listen on ${lanIp}:$WebPort"
}
Write-Host "  API        http://127.0.0.1:$ApiPort/healthz"
Write-Host "  Wallet     $OwnerWallet"
Write-Host "  Database   $DbName"
Write-Host "  Logs       .paper\logs"
Write-Host "  Stop       .\tools\paper\down.ps1"
