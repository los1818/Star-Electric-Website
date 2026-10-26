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
$Root = if ($env:SPARKS_ROOT) { $env:SPARKS_ROOT } else { "C:\Sparks" } # SPARKS_ROOT: for testing
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

# Tidy up old versions left by earlier updates, but never one still holding settings or photos.
Get-ChildItem $Root -Directory -Filter "app-old-*" -ErrorAction SilentlyContinue |
  Where-Object { -not (Test-Path (Join-Path $_.FullName ".env")) -and -not (Test-Path (Join-Path $_.FullName "storage")) } |
  ForEach-Object { Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }

if ($needsUpdate) {
  # Stop any copy of Sparks that's running (from any folder), so files aren't locked.
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -eq "node.exe" -and $_.CommandLine -match "next" -and ($_.CommandLine -match "-p 3100" -or $_.CommandLine -match "Star-Electric-Website" -or $_.CommandLine -match [regex]::Escape($App)) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

  Say "Downloading the latest Sparks"
  # Download next to the app (same drive), so folders can be moved instantly and nothing lives in TEMP.
  $dl = Join-Path $Root "download"
  Remove-Item $dl -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $dl | Out-Null
  $ref = if ($latest) { $latest } else { $Branch }
  Invoke-WebRequest "https://github.com/$Repo/archive/$ref.zip" -OutFile (Join-Path $dl "sparks.zip") -UseBasicParsing
  Expand-Archive (Join-Path $dl "sparks.zip") $dl -Force
  $fresh = Get-ChildItem $dl -Directory | ForEach-Object { Join-Path $_.FullName "sparks" } | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $fresh) { throw "The download didn't contain the sparks folder." }

  if (-not (Test-Path $App)) {
    Say "Installing to C:\Sparks\app"
    Move-Item $fresh $App
  } else {
    Say "Updating (your settings, photos and data are kept)"
    # 1. Set the current version aside. If Windows won't let go of it (a window open on the folder,
    #    antivirus), stop here and start the version you have: nothing has been touched yet.
    $old = "$App-old-$(Get-Date -Format yyyyMMddHHmmss)"
    try {
      Rename-Item $App $old -ErrorAction Stop
    } catch {
      Write-Host "Couldn't update right now ($($_.Exception.Message)). Close any window showing C:\Sparks\app; it will update next time." -ForegroundColor DarkYellow
      $old = $null
    }
    if ($old) {
      # 2. Put the new version in place; if that fails, put the old one back.
      try {
        Move-Item $fresh $App -ErrorAction Stop
      } catch {
        Rename-Item $old $App
        throw "The update couldn't be installed ($($_.Exception.Message)). Your current version is still there; try again."
      }
      # 3. Move your settings, photos and installed components across. The old folder is only
      #    deleted once all of them made it.
      $kept = $true
      foreach ($keep in ".env", "storage", "node_modules") {
        $from = Join-Path $old $keep
        if (Test-Path $from) {
          $to = Join-Path $App $keep
          Remove-Item $to -Recurse -Force -ErrorAction SilentlyContinue
          try { Move-Item $from $to -ErrorAction Stop } catch { $kept = $false; Write-Host "Couldn't move $keep ($($_.Exception.Message)). It's still in $old." -ForegroundColor DarkYellow }
        }
      }
      if ($latest) { Set-Content $VersionFile $latest -NoNewline }
      if ($kept) { Remove-Item $old -Recurse -Force -ErrorAction SilentlyContinue }
    }
  }
  Remove-Item $dl -Recurse -Force -ErrorAction SilentlyContinue
  if (-not (Test-Path $VersionFile) -and $latest) { Set-Content $VersionFile $latest -NoNewline }

  # Keep the launcher itself current.
  Copy-Item (Join-Path $App "scripts\install-windows.ps1") $Launcher -Force
}

# If an earlier update had to leave your settings or photos in an old folder (Windows wouldn't let
# go of them), bring them back now.
if (Test-Path $App) {
  foreach ($keep in ".env", "storage") {
    if (Test-Path (Join-Path $App $keep)) { continue }
    $stranded = Get-ChildItem $Root -Directory -Filter "app-old-*" -ErrorAction SilentlyContinue |
      Where-Object { Test-Path (Join-Path $_.FullName $keep) } | Sort-Object Name -Descending | Select-Object -First 1
    if ($stranded) {
      try { Move-Item (Join-Path $stranded.FullName $keep) (Join-Path $App $keep) -ErrorAction Stop; Write-Host "Recovered $keep from $($stranded.Name)." -ForegroundColor Green }
      catch { Write-Host "Your $keep is safe in $($stranded.FullName) but couldn't be moved back ($($_.Exception.Message))." -ForegroundColor DarkYellow }
    }
  }
}

if ($env:SPARKS_TEST_NO_START) { return } # testing: stop before the shortcut and start-up

# Desktop icon -> this launcher (update check, then start).
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
