# 1. Setup paths
$InstallDir = Join-Path $HOME ".qtex"
$RuntimeDir = Join-Path $InstallDir "runtime"
$BinDir = Join-Path $InstallDir "bin"
$QtexJs = Join-Path $InstallDir "qtex.js"
$ShimPath = Join-Path $BinDir "qtex.bat"
$Repo = "srsergiolazaro/qtex"

Write-Host "🌀 qtex Installer (Hybrid Architecture)" -ForegroundColor Magenta

# 2. Creating directories & Cleaning old binaries
if (-not (Test-Path $RuntimeDir)) { New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null }
if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir -Force | Out-Null }
if (Test-Path "$BinDir\qtex.exe") { Remove-Item "$BinDir\qtex.exe" -Force -ErrorAction SilentlyContinue }

# 3. Download/Install Bun Engine (The "Motor")
$BunPath = Join-Path $RuntimeDir "bun.exe"

# Check if existing Bun is broken
if (Test-Path $BunPath) {
    try {
        & $BunPath --version | Out-Null
    } catch {
        Write-Host "⚠️  Existing Bun runtime is broken or incompatible. Reinstalling..." -ForegroundColor Yellow
        Remove-Item $BunPath -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $BunPath)) {
    Write-Host "⚙️  Installing Bun Runtime (First time only)..." -ForegroundColor Blue
    try {
        # Download Bun for Windows
        Invoke-WebRequest "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip" -OutFile "$RuntimeDir\bun.zip"
        Expand-Archive "$RuntimeDir\bun.zip" -DestinationPath "$RuntimeDir" -Force
        
        # Move bun.exe to clean location and cleanup
        $Extracted = Get-ChildItem "$RuntimeDir\bun-windows-x64" -Filter "bun.exe" -Recurse | Select-Object -First 1
        Move-Item $Extracted.FullName $BunPath -Force
        Remove-Item "$RuntimeDir\bun.zip" -Force
        Remove-Item "$RuntimeDir\bun-windows-x64" -Recurse -Force
    } catch {
        Write-Host "❌ Failed to install Bun runtime." -ForegroundColor Red
        return
    }
}

# 4. Download latest qtex bundle (The "Cartridge")
Write-Host "📦 Downloading latest qtex bundle..." -ForegroundColor Blue
try {
    # If upgrading, we can fetch from release. For now during dev, fetching raw from repo or release
    # For production, this should point to releases/latest/download/qtex.js
    $Url = "https://github.com/$Repo/releases/latest/download/qtex.js"
    Invoke-WebRequest -Uri $Url -OutFile $QtexJs -ErrorAction Stop
} catch {
     Write-Host "❌ Failed to download qtex.js from latest release." -ForegroundColor Red
     return
}

# 5. Create Shim (The "Key")
Write-Host "🔌 Creating entry point..." -ForegroundColor Blue
$ShimContent = "@echo off`r`n`"$BunPath`" run `"$QtexJs`" %*"
Set-Content -Path $ShimPath -Value $ShimContent

# 6. Add to PATH
$CurrentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($CurrentPath -notlike "*$BinDir*") {
    $NewPath = "$CurrentPath;$BinDir"
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    $env:Path = "$env:Path;$BinDir"
}

Write-Host "✨ qtex installed! Update size reduced by 99%." -ForegroundColor Green
