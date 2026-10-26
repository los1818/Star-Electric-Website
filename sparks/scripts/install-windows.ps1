# Installs, updates and starts Sparks on Windows.
#
# First time, paste in Windows PowerShell:
#   irm https://raw.githubusercontent.com/los1818/Star-Electric-Website/claude/cool-turing-1117wj/sparks/scripts/install-windows.ps1 | iex
#
# That puts Sparks in C:\Sparks\app and a "Sparks" icon on the desktop. The icon runs a copy of this
# script (C:\Sparks\sparks.ps1), which checks GitHub for a newer version each time, installs it if
# there is one (keeping your settings, photos and database), then starts Sparks. No more pasting.
$ErrorActionPreference = "Stop"
$Repo = "los1818/Star-Electric-Website"
$Branch = "claude/cool-turing-1117wj"
$Root = "C:\Sparks"
$App = Join-Path $Root "app"
$VersionFile = Join-Path $App ".sparks-version"
$Launcher = Join-Path $Root "sparks.ps1"

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
# Show what went wrong instead of the window vanishing.
trap { Write-Host "`nProblem: $($_.Exception.Message)`n" -ForegroundColor Red; Read-Host "Press Enter to close"; break }
New-Item -ItemType Directory -Force $Root | Out-Null
Set-Location $Root
$ProgressPreference = "SilentlyContinue" # makes downloads much faster

# What's the newest version on GitHub? (If we can't tell, e.g. offline, just start what's here.)
$latest = $null
try {
  $latest = (Invoke-RestMethod "https://api.github.com/repos/$Repo/commits/$([uri]::EscapeDataString($Branch))" -Headers @{ "User-Agent" = "sparks-updater" } -TimeoutSec 15).sha
} catch {
  Write-Host "Couldn't check for updates ($($_.Exception.Message)). Starting the version on this PC." -ForegroundColor DarkYellow
}
$current = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "" }
$needsUpdate = -not (Test-Path $App) -or ($latest -and $latest -ne $current)
if (-not (Test-Path $App) -and -not $latest) { throw "Sparks isn't installed yet and GitHub can't be reached. Check the internet connection and try again." }

if ($needsUpdate) {
  # Stop any copy of Sparks that's running (from any folder), so files aren't locked.
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "next" -and ($_.CommandLine -match "-p 3100" -or $_.CommandLine -match "Star-Electric-Website" -or $_.CommandLine -match [regex]::Escape($App)) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Say "Downloading the latest Sparks"
  $tmp = Join-Path $env:TEMP "sparks-download"
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $tmp | Out-Null
  $ref = if ($latest) { $latest } else { $Branch }
  Invoke-WebRequest "https://github.com/$Repo/archive/$ref.zip" -OutFile (Join-Path $tmp "sparks.zip") -UseBasicParsing
  Expand-Archive (Join-Path $tmp "sparks.zip") $tmp -Force
  $fresh = Get-ChildItem $tmp -Directory | ForEach-Object { Join-Path $_.FullName "sparks" } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $fresh) { throw "The download didn't contain the sparks folder." }

  if (Test-Path $App) {
    Say "Updating (your settings, photos and data are kept)"
    # Settings and photos come across; installed components too, so the update starts quickly.
    foreach ($keep in ".env", "storage") {
      if (Test-Path (Join-Path $App $keep)) { Copy-Item (Join-Path $App $keep) (Join-Path $fresh $keep) -Recurse -Force }
    }
    if (Test-Path (Join-Path $App "node_modules")) { Move-Item (Join-Path $App "node_modules") (Join-Path $fresh "node_modules") -ErrorAction SilentlyContinue }
    $old = "$App-old-$(Get-Date -Format yyyyMMddHHmmss)"
    Rename-Item $App $old
    Start-Job -ScriptBlock { param($p) Remove-Item $p -Recurse -Force -ErrorAction SilentlyContinue } -ArgumentList $old | Out-Null
  } else {
    Say "Installing to C:\Sparks\app"
  }
  Move-Item $fresh $App
  if ($latest) { Set-Content $VersionFile $latest -NoNewline }
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

  # Keep the launcher itself current.
  Copy-Item (Join-Path $App "scripts\install-windows.ps1") $Launcher -Force
}

# Desktop icon → this launcher (update check, then start).
if (-not (Test-Path $Launcher)) { Copy-Item (Join-Path $App "scripts\install-windows.ps1") $Launcher -Force }
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath("Desktop")) "Sparks.lnk"))
$link.TargetPath = "powershell.exe"
$link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
$link.WorkingDirectory = $Root
$link.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$link.Description = "Update and start Sparks"
$link.Save()

if (-not $needsUpdate) { Write-Host "Sparks is up to date." -ForegroundColor Green }
Say "Starting Sparks"
& (Join-Path $App "Start Sparks (Windows).cmd")
