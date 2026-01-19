# 1. Setup paths
$InstallDir = Join-Path $HOME ".qtex"
$BinDir = Join-Path $InstallDir "bin"
$BinaryName = "qtex.exe"
$Repo = "srsergiolazaro/qtex"

Write-Host "🌀 qtex Installer" -ForegroundColor Magenta

# 2. Preparation & Clean Up
# Resolve conflict with old hybrid installation
if (Test-Path (Join-Path $InstallDir "runtime")) {
    Write-Host "⚠️  Detected old hybrid installation. Cleaning up..." -ForegroundColor Yellow
    Remove-Item $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir -Force | Out-Null }

# 3. Download standalone binary from GitHub
Write-Host "🚚 Downloading qtex-windows-x64 (Standalone binary)..." -ForegroundColor Blue
try {
    $Url = "https://github.com/$Repo/releases/latest/download/qtex-windows-x64.exe"
    Invoke-WebRequest -Uri $Url -OutFile (Join-Path $BinDir $BinaryName) -ErrorAction Stop
} catch {
    Write-Host "❌ Download failed from GitHub. Please check your connection." -ForegroundColor Red
    return
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
