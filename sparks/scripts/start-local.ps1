# Start Sparks on this computer (Windows). Safe to run again: the first run sets things up,
# later runs just start the app. Demo data loads only into an empty database, so updating never
# wipes your data. Run with -ResetDemo to deliberately wipe everything and reload the demo data.
param([switch]$ResetDemo)
# "Continue", not "Stop": Windows PowerShell 5.1 turns harmless stderr output from native tools
# (docker, npm) into terminating errors under "Stop". Exit codes are checked explicitly instead.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
# Sparks always uses this port, so it never collides with (or gets mistaken for) another app
# on the usual 3000/3001.
$Port = 3100

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`nProblem: $msg`n" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Run($exe, [string[]]$argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { Fail "'$exe $($argList -join ' ')' failed (see the messages above)." }
}

function Refresh-Path { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }
function Winget-Install($id, $label) {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { return $false }
  Say "Installing $label (one time; Windows may ask for permission)"
  winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements | Out-Host
  Refresh-Path
  return $true
}

# Node.js: install it if missing.
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Winget-Install "OpenJS.NodeJS.LTS" "Node.js" | Out-Null }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js isn't installed. Install the LTS version from https://nodejs.org and run this again." }
$major = [int]((node -v).TrimStart("v").Split(".")[0])
if ($major -lt 20) { Fail "Node.js $(node -v) is too old. Install the LTS version (22) from https://nodejs.org." }

# Docker Desktop: install it if missing (needs a restart afterwards), open it if it isn't running.
$dockerExe = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
if (-not (Get-Command docker -ErrorAction SilentlyContinue) -and -not (Test-Path $dockerExe)) {
  if (Winget-Install "Docker.DockerDesktop" "Docker Desktop") {
    Fail "Docker Desktop was just installed. Restart the PC, open Docker Desktop once (accept its terms), then double-click the Sparks icon on your desktop."
  }
  Fail "Docker Desktop isn't installed. Install it from https://www.docker.com/products/docker-desktop/ and run this again."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { $env:Path += ";" + (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin") }
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  if (Test-Path $dockerExe) {
    Say "Opening Docker Desktop and waiting for it (up to 3 minutes)"
    Start-Process $dockerExe
    for ($i = 0; $i -lt 90; $i++) { Start-Sleep -Seconds 2; docker info *> $null; if ($LASTEXITCODE -eq 0) { break } }
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop isn't running. Open Docker Desktop, wait until it says it's running, then run this again." }
}

if (-not (Test-Path ".env")) {
  Say "Creating settings file (.env)"
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  (Get-Content ".env.example" -Raw) -replace '(?m)^AUTH_SECRET=.*$', "AUTH_SECRET=`"$secret`"" | Set-Content ".env" -NoNewline -Encoding utf8
}

# Sign-in links follow whatever address you open Sparks at (so phones on the same Wi-Fi work);
# an AUTH_URL pinned to localhost from an older version would send them back to localhost.
$envText = Get-Content ".env" -Raw
$fixed = $envText -replace '(?m)^AUTH_URL="?http://localhost.*\r?\n?', ''
# The database moved to its own port (55432) so it can't clash with another PostgreSQL.
$fixed = $fixed -replace 'sparks:sparks@localhost:5432/', 'sparks:sparks@localhost:55432/'
if ($fixed -ne $envText) { $fixed | Set-Content ".env" -NoNewline -Encoding utf8 }

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($busy) {
  # Already running and working (e.g. started earlier)? Then just open it.
  try {
    $page = Invoke-WebRequest "http://localhost:$Port/login" -UseBasicParsing -TimeoutSec 15
    if ($page.Content -match "Sparks" -and $page.Content -notmatch "Runtime Error|did not initialize") {
      Say "Sparks is already running. Opening http://localhost:$Port"
      Start-Process "http://localhost:$Port"
      Read-Host "Press Enter to close this window (Sparks keeps running in its own window)"
      exit 0
    }
  } catch { }
  # A broken or leftover copy of Sparks (any folder) holding the port: stop it.
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($busy.OwningProcess)" -ErrorAction SilentlyContinue
  if ($proc -and $proc.CommandLine -match "next" -and $proc.CommandLine -match "$Port") {
    Say "Stopping an older copy of Sparks that was still running"
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "next" -and $_.CommandLine -match "-p $Port" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Stop-Process -Id $busy.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
  }
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    $who = (Get-Process -Id $busy.OwningProcess -ErrorAction SilentlyContinue).ProcessName
    Fail "Another program ($who) is using port $Port, so Sparks can't start. Close it, or restart the PC, then run this again."
  }
}

Say "Installing app components (first time takes a few minutes)"
Run "npm" @("install", "--no-audit", "--no-fund", "--loglevel=error")

Say "Starting the database"
Run "docker" @("compose", "up", "-d")
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  docker compose exec -T db pg_isready -U sparks *> $null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) { Fail "The database didn't start. Check Docker Desktop for errors." }

Say "Updating the database"
Run "npx" @("prisma", "migrate", "deploy")
Run "npx" @("prisma", "generate")

npx tsx scripts/needs-seed.ts
if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 10) { Fail "Couldn't check the database (see the messages above)." }
$empty = ($LASTEXITCODE -eq 0)
if ($ResetDemo -or $empty) {
  Say "Loading demo data (fake customers, jobs and staff)"
  Run "npx" @("prisma", "db", "seed")
}

# Open the browser once the app answers.
Start-Job -ScriptBlock {
  for ($i = 0; $i -lt 120; $i++) {
    try { Invoke-WebRequest "http://localhost:$using:Port/login" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process "http://localhost:$using:Port"; return } catch { Start-Sleep -Seconds 2 }
  }
} | Out-Null

# The real network card is the one with a default gateway (not WSL/Hyper-V/Docker virtual adapters).
$lan = (Get-NetIPConfiguration -ErrorAction SilentlyContinue | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq "Up" } | Select-Object -First 1).IPv4Address.IPAddress | Select-Object -First 1
Say "Sparks is starting at http://localhost:$Port  (leave this window open; press Ctrl+C to stop)"
if ($lan) { Write-Host "    From a phone or another computer on the same network: http://${lan}:$Port" -ForegroundColor Yellow }
# -p: a fixed port (fails rather than quietly moving to another one); -H: reachable on the local network.
# Not Run(): stopping Sparks (Ctrl+C or closing the window) ends next with a non-zero code, which
# isn't a problem.
npx next dev -p "$Port" -H 0.0.0.0
Write-Host "`nSparks has stopped. Double-click the Sparks icon to start it again." -ForegroundColor Yellow
