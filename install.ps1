$InstallDir = Join-Path $HOME ".qtex"
$BinDir = Join-Path $InstallDir "bin"
$BinaryName = "qtex.exe"
$Repo = "srsergiolazaro/qtex"
$AssetName = "qtex-windows-x64.exe"

Write-Host "🌀 qtex Installer" -ForegroundColor Magenta

# 1. Create installation directory
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir | Out-Null
}

# 2. Download binary from GitHub
Write-Host "🚚 Downloading $AssetName from GitHub..." -ForegroundColor Blue
$Url = "https://github.com/$Repo/releases/latest/download/$AssetName"
$TargetFile = Join-Path $BinDir $BinaryName
$OldFile = "$TargetFile.old"

# Handle file locking on Windows (rename running executable)
if (Test-Path $TargetFile) {
    try {
        if (Test-Path $OldFile) { Remove-Item $OldFile -Force -ErrorAction SilentlyContinue }
        Move-Item $TargetFile $OldFile -Force
    } catch {
        Write-Host "⚠️  Could not move existing binary. Update might fail if qtex is running." -ForegroundColor Yellow
    }
}

try {
    Invoke-WebRequest -Uri $Url -OutFile $TargetFile -ErrorAction Stop
} catch {
    Write-Host "❌ Download failed: $($_.Exception.Message)" -ForegroundColor Red
    # Restore backup if download failed
    if (Test-Path $OldFile) { Move-Item $OldFile $TargetFile -Force -ErrorAction SilentlyContinue }
    exit 1
}

# 3. Add to PATH automatically
Write-Host "⚙️ Adding $BinDir to User PATH..." -ForegroundColor Blue
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    $NewPath = "$CurrentPath;$BinDir"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    $env:Path = "$env:Path;$BinDir"
    Write-Host "✅ PATH updated. Please restart your terminal." -ForegroundColor Green
} else {
    Write-Host "✅ $BinDir is already in your PATH." -ForegroundColor Green
}

Write-Host "`n✨ qtex installed successfully!" -ForegroundColor Green
Write-Host "Usage example: qtex ./example --watch" -ForegroundColor Blue
