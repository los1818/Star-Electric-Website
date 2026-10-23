# Start Sparks on this computer (Windows). Safe to run again: the first run sets things up,
# later runs just start the app. Demo data loads only into an empty database, so updating never
# wipes your data. Run with -ResetDemo to deliberately wipe everything and reload the demo data.
param([switch]$ResetDemo)
# "Continue", not "Stop": Windows PowerShell 5.1 turns harmless stderr output from native tools
# (docker, npm) into terminating errors under "Stop". Exit codes are checked explicitly instead.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`nProblem: $msg`n" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Run($exe, [string[]]$argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { Fail "'$exe $($argList -join ' ')' failed (see the messages above)." }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js isn't installed. Install the LTS version from https://nodejs.org and run this again." }
$major = [int]((node -v).TrimStart("v").Split(".")[0])
if ($major -lt 20) { Fail "Node.js $(node -v) is too old. Install the LTS version (22) from https://nodejs.org." }
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker Desktop isn't installed. Install it from https://www.docker.com/products/docker-desktop/ and run this again." }
docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop isn't running. Open Docker Desktop, wait until it says it's running, then run this again." }

if (-not (Test-Path ".env")) {
  Say "Creating settings file (.env)"
  $bytes = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  (Get-Content ".env.example" -Raw) -replace '(?m)^AUTH_SECRET=.*$', "AUTH_SECRET=`"$secret`"" | Set-Content ".env" -NoNewline -Encoding utf8
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

npx tsx scripts/needs-seed.ts
$empty = ($LASTEXITCODE -eq 0)
if ($ResetDemo -or $empty) {
  Say "Loading demo data (fake customers, jobs and staff)"
  Run "npx" @("prisma", "db", "seed")
}

# Open the browser once the app answers.
Start-Job -ScriptBlock {
  for ($i = 0; $i -lt 120; $i++) {
    try { Invoke-WebRequest "http://localhost:3000/login" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process "http://localhost:3000"; return } catch { Start-Sleep -Seconds 2 }
  }
} | Out-Null

Say "Sparks is starting at http://localhost:3000  (leave this window open; press Ctrl+C to stop)"
npm run dev
