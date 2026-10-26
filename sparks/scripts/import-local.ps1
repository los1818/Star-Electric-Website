# Load your real Trimble data and users into Sparks on this PC (replaces the demo data).
# Put the exports in C:\Sparks\import (the folder next to the app), then double-click
# "Import Trimble Data (Windows).cmd". Safe to run again with newer exports: records are
# matched to what's already there and updated, never duplicated.
$ErrorActionPreference = "Continue"
Set-Location (Join-Path $PSScriptRoot "..")
function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
function Fail($msg) { Write-Host "`nProblem: $msg`n" -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
function Run($exe, [string[]]$argList) {
  & $exe @argList
  if ($LASTEXITCODE -ne 0) { Fail "'$exe $($argList -join ' ')' failed (see the messages above)." }
}

$importDir = Join-Path (Split-Path (Get-Location)) "import"
New-Item -ItemType Directory -Force $importDir | Out-Null
function Find($pattern) { Get-ChildItem $importDir -File -Filter $pattern -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1 }
$customers = Find "*ustomer*.csv"
$jobs = Find "*job*.csv"
$inventory = Find "*nventory*.xlsx"
$users = Find "*user*.csv"

Write-Host "Looking in $importDir"
Write-Host ("  Customers: " + ($(if ($customers) { $customers.Name } else { "not found (e.g. Customers.csv)" })))
Write-Host ("  Jobs:      " + ($(if ($jobs) { $jobs.Name } else { "not found (e.g. Jobs.csv)" })))
Write-Host ("  Inventory: " + ($(if ($inventory) { $inventory.Name } else { "not found (optional, e.g. inventory.xlsx)" })))
Write-Host ("  Users:     " + ($(if ($users) { $users.Name } else { "not found (optional, e.g. users.csv)" })))
$trimble = $customers -and $jobs
if (-not $trimble -and -not $users -and -not $inventory) {
  Start-Process explorer.exe $importDir
  Fail "Put the files (Trimble Customers and Jobs CSVs, inventory .xlsx, users .csv) in the folder that just opened ($importDir), then run this again."
}
if (-not $trimble -and ($customers -or $jobs)) { Fail "The Trimble import needs both the Customers and the Jobs CSV in $importDir." }

docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Desktop isn't running. Open it, wait until it's running, then run this again." }
Say "Starting the database"
Run "docker" @("compose", "up", "-d")
for ($i = 0; $i -lt 60; $i++) { docker compose exec -T db pg_isready -U sparks *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Seconds 1 }
Run "npx" @("prisma", "migrate", "deploy")
Run "npx" @("prisma", "generate")

Say "Checking the files (nothing is changed yet)"
if ($trimble) { Run "npx" @("tsx", "scripts/import-trimble-csv/index.ts", "--customers", $customers.FullName, "--jobs", $jobs.FullName) }
if ($inventory) { Run "npx" @("tsx", "scripts/import-accubid-inventory/index.ts", "--file", $inventory.FullName) }
if ($users) { Run "npx" @("tsx", "scripts/import-people/index.ts", "--file", $users.FullName) }

if ($trimble) { Write-Host "`nThis loads your real data into Sparks. The first time, it REPLACES the demo data." -ForegroundColor Yellow }
else { Write-Host "`nThis adds the files above to Sparks (the demo data stays)." -ForegroundColor Yellow }
Write-Host "Reports of anything to check are in the scripts\import-trimble-csv\reports folder."
$answer = Read-Host "Type YES to go ahead"
if ($answer -ne "YES") { Write-Host "Nothing was changed."; Read-Host "Press Enter to close"; exit 0 }

if ($trimble) {
  Say "Importing customers, job sites, jobs and invoices"
  Run "npx" @("tsx", "scripts/import-trimble-csv/index.ts", "--customers", $customers.FullName, "--jobs", $jobs.FullName, "--apply", "--replace-demo")
}
if ($inventory) { Say "Importing inventory"; Run "npx" @("tsx", "scripts/import-accubid-inventory/index.ts", "--file", $inventory.FullName, "--apply") }
if ($users) { Say "Adding users"; Run "npx" @("tsx", "scripts/import-people/index.ts", "--file", $users.FullName, "--apply") }

Say "Done. Open Sparks (http://localhost:3100) and sign in as yourself from the list on the sign-in page."
Read-Host "Press Enter to close"
