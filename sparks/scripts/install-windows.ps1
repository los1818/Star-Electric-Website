# Installs, updates and starts Sparks on Windows.
#
# Sparks lives in the private GitHub repo los1818/Sparks. This PC reads it with a read-only access
# token, asked for once and kept encrypted for this Windows user in C:\Sparks\github-token.txt
# (Windows DPAPI: other accounts on the PC can't read it). See RUN-ON-WINDOWS.md.
#
# The "Sparks" desktop icon runs a copy of this script (C:\Sparks\sparks.ps1). Each start it finds
# the newest version on main that passed its tests (.github/workflows/ci.yml), installs it if it's
# newer (keeping your settings, photos and database), then starts Sparks.
$ErrorActionPreference = "Stop"
$Repo = "los1818/Sparks"
$Branch = "main"
$Root = if ($env:SPARKS_ROOT) { $env:SPARKS_ROOT } else { "C:\Sparks" } # SPARKS_ROOT: for testing
$App = Join-Path $Root "app"
$VersionFile = Join-Path $App ".sparks-version"
$Launcher = Join-Path $Root "sparks.ps1"
$TokenFile = Join-Path $Root "github-token.txt"

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
# Show what went wrong instead of the window vanishing.
trap { Write-Host "`nProblem: $($_.Exception.Message)`n" -ForegroundColor Red; Read-Host "Press Enter to close"; break }
New-Item -ItemType Directory -Force $Root | Out-Null
Set-Location $Root
$ProgressPreference = "SilentlyContinue" # makes downloads much faster

# The access token (read-only, Sparks repo only). Asked for once.
if (-not (Test-Path $TokenFile)) {
  Write-Host "`nSparks has moved to a private GitHub repository, so this PC needs a read-only access key (one time)." -ForegroundColor Yellow
  Write-Host "A GitHub page will open. Sign in as los1818, then:"
  Write-Host "  1. Token name: Sparks PC.  Expiration: 1 year (or No expiration)."
  Write-Host "  2. Repository access: Only select repositories -> Sparks."
  Write-Host "  3. Permissions -> Repository: Contents = Read-only, Actions = Read-only."
  Write-Host "  4. Click Generate token, copy it, then click back into this window."
  Start-Process "https://github.com/settings/personal-access-tokens/new"
  $pasted = (Read-Host "Paste the token here and press Enter").Trim()
  if ($pasted -notmatch '^(github_pat_|ghp_)[A-Za-z0-9_]+$') { throw "That doesn't look like a GitHub token (it starts with github_pat_). Start Sparks again to retry." }
  ConvertTo-SecureString $pasted -AsPlainText -Force | ConvertFrom-SecureString | Set-Content $TokenFile
}
try {
  $secure = Get-Content $TokenFile -Raw | ConvertTo-SecureString
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
} catch {
  Remove-Item $TokenFile -Force -ErrorAction SilentlyContinue
  throw "The saved GitHub access key couldn't be read (saved by another Windows user?). Start Sparks again to enter it."
}
$headers = @{ "User-Agent" = "sparks-updater"; "Accept" = "application/vnd.github+json"; "Authorization" = "Bearer $token" }

# Which version to run: the newest commit on main whose tests passed, so a broken change never
# reaches this PC; never one older than what's installed. (Offline: start what's here.)
$latest = $null
$installed = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "" }
try {
  $runs = (Invoke-RestMethod "https://api.github.com/repos/$Repo/actions/workflows/ci.yml/runs?branch=$Branch&event=push&status=success&per_page=1" -Headers $headers -TimeoutSec 15).workflow_runs
  if ($runs) { $latest = @($runs)[0].head_sha }
  if ($latest -and $installed -and $latest -ne $installed) {
    # Installed version from this repo and newer than the latest tested one? Stay put.
    try {
      $cmp = Invoke-RestMethod "https://api.github.com/repos/$Repo/compare/$latest...$installed" -Headers $headers -TimeoutSec 15
      if ($cmp.status -eq "ahead") { $latest = $installed }
    } catch {
      # 404: the installed version isn't from this repo (e.g. the old one), so update. Anything else
      # (timeout, rate limit): don't risk going backwards; keep what's installed this time.
      if ($_.Exception.Response.StatusCode.value__ -ne 404) { $latest = $installed }
    }
  }
  if (-not $latest) { Write-Host "No tested version found on GitHub yet. Starting the version on this PC." -ForegroundColor DarkYellow }
} catch {
  $code = $_.Exception.Response.StatusCode.value__
  if ($code -eq 401) {
    Remove-Item $TokenFile -Force -ErrorAction SilentlyContinue
    Write-Host "GitHub didn't accept the access key (it may have expired). Start Sparks again to enter a new one." -ForegroundColor DarkYellow
  } elseif ($code -eq 403 -or $code -eq 404) {
    Write-Host "GitHub refused the update check ($code). Check the access key covers the Sparks repo with Contents and Actions read-only. Starting the version on this PC." -ForegroundColor DarkYellow
  } else {
    Write-Host "Couldn't check for updates right now ($($_.Exception.Message)). Starting the version on this PC." -ForegroundColor DarkYellow
  }
}
$current = if (Test-Path $VersionFile) { (Get-Content $VersionFile -Raw).Trim() } else { "" }
$needsUpdate = -not (Test-Path $App) -or ($latest -and $latest -ne $current)
if (-not (Test-Path $App) -and -not $latest) { throw "Sparks isn't installed yet and no tested version could be downloaded. Check the internet connection and try again." }

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
  Invoke-WebRequest "https://api.github.com/repos/$Repo/zipball/$latest" -Headers $headers -OutFile (Join-Path $dl "sparks.zip") -UseBasicParsing
  Expand-Archive (Join-Path $dl "sparks.zip") $dl -Force
  # The zip holds one folder (los1818-Sparks-<commit>) with the app at its top.
  $fresh = Get-ChildItem $dl -Directory | Where-Object { Test-Path (Join-Path $_.FullName "package.json") } | Select-Object -ExpandProperty FullName -First 1
  if (-not $fresh) { throw "The download didn't contain Sparks." }

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
