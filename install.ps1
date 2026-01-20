# 1. Setup paths
$InstallDir = Join-Path $HOME ".qtex"
$BinDir = Join-Path $InstallDir "bin"
$BinaryName = "qtex.exe"
$Repo = "srsergiolazaro/qtex"

Write-Host "🌀 qtex Installer (Rust Edition)" -ForegroundColor Magenta

# 0. Check for PATH conflicts (Cargo version)
$CargoBin = Join-Path $HOME ".cargo\bin\qtex.exe"
if (Test-Path $CargoBin) {
    Write-Host "⚠️  Warning: A development version of qtex was found in your Cargo bin folder." -ForegroundColor Yellow
    Write-Host "   This will override the official installation. Run 'cargo uninstall qtex' to fix this." -ForegroundColor Gray
}

# 2. Preparation & Clean Up
# Resolve conflict with old hybrid installation
if (Test-Path (Join-Path $InstallDir "runtime")) {
    Write-Host "⚠️  Detected old hybrid installation. Cleaning up..." -ForegroundColor Yellow
    Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir -Force | Out-Null }

# 3. Get Latest Version and Download
try {
    Write-Host "🔍 Checking for latest version..." -ForegroundColor Gray
    $ReleaseInfo = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest"
    $LatestVersion = $ReleaseInfo.tag_name
    
    Write-Host "🚚 Installing qtex $LatestVersion..." -ForegroundColor Blue
    $Url = "https://github.com/$Repo/releases/download/$LatestVersion/qtex-windows-x64.exe"
    Invoke-WebRequest -Uri $Url -OutFile (Join-Path $BinDir $BinaryName) -ErrorAction Stop
} catch {
    # Fallback to 'latest' redirect if API fails
    Write-Host "⚠️  Could not fetch version info, downloading latest build..." -ForegroundColor Yellow
    $Url = "https://github.com/$Repo/releases/latest/download/qtex-windows-x64.exe"
    Invoke-WebRequest -Uri $Url -OutFile (Join-Path $BinDir $BinaryName) -ErrorAction Stop
}

# 4. Add to PATH
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    Write-Host "⚙️  Adding $BinDir to PATH..." -ForegroundColor Blue
    $NewPath = "$CurrentPath;$BinDir"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    $env:Path = "$env:Path;$BinDir"
    Write-Host "✅ Path updated." -ForegroundColor Green
} else {
    Write-Host "✅ $BinDir is already in your PATH." -ForegroundColor Green
}

Write-Host "`n✨ qtex installed successfully!" -ForegroundColor Green
Write-Host "Please restart your terminal to start using 'qtex'."
Write-Host "Usage example: " -NoNewline; Write-Host "qtex ./example --watch" -ForegroundColor Blue
