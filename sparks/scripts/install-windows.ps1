# One-paste installer / updater for Sparks on Windows. Run in PowerShell:
#   irm https://raw.githubusercontent.com/los1818/Star-Electric-Website/claude/cool-turing-1117wj/sparks/scripts/install-windows.ps1 | iex
# Puts Sparks in C:\Sparks\app (keeping your settings and photos when updating), adds a "Sparks"
# icon to the desktop, then starts it. The start script installs Node.js / opens Docker if needed.
$ErrorActionPreference = "Stop"
$Branch = "claude/cool-turing-1117wj"
$Root = "C:\Sparks"
$App = Join-Path $Root "app"
$Zip = "https://github.com/los1818/Star-Electric-Website/archive/refs/heads/$Branch.zip"

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }

# Stop any copy of Sparks that's still running (from any folder), so files aren't locked.
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "next" -and ($_.CommandLine -match "-p 3100" -or $_.CommandLine -match "Star-Electric-Website" -or $_.CommandLine -match [regex]::Escape($App)) } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Say "Downloading the latest Sparks"
New-Item -ItemType Directory -Force $Root | Out-Null
$tmp = Join-Path $env:TEMP "sparks-download"
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $tmp | Out-Null
$ProgressPreference = "SilentlyContinue" # makes Invoke-WebRequest much faster
Invoke-WebRequest $Zip -OutFile (Join-Path $tmp "sparks.zip") -UseBasicParsing
Expand-Archive (Join-Path $tmp "sparks.zip") $tmp -Force
$fresh = Get-ChildItem $tmp -Directory | ForEach-Object { Join-Path $_.FullName "sparks" } | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $fresh) { throw "The download didn't contain the sparks folder." }

# Keep settings (.env) and uploaded photos (storage) from the current copy.
if (Test-Path $App) {
  Say "Updating C:\Sparks\app (your settings and photos are kept)"
  foreach ($keep in ".env", "storage") {
    if (Test-Path (Join-Path $App $keep)) { Copy-Item (Join-Path $App $keep) (Join-Path $fresh $keep) -Recurse -Force }
  }
  $old = "$App-old-$(Get-Date -Format yyyyMMddHHmmss)"
  Rename-Item $App $old
  Start-Job -ScriptBlock { param($p) Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue } -ArgumentList $old | Out-Null
} else {
  Say "Installing to C:\Sparks\app"
}
Move-Item $fresh $App
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Say "Adding a Sparks icon to your desktop"
$start = Join-Path $App "Start Sparks (Windows).cmd"
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Sparks.lnk"))
$link.TargetPath = $start
$link.WorkingDirectory = $App
$link.Description = "Start Sparks"
$link.Save()

Say "Starting Sparks (a new window opens; leave it open while you use Sparks)"
Start-Process $start -WorkingDirectory $App
