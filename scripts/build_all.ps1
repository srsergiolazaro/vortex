# Build script for qtex (Windows native + Cross-compilation)
# Requirements: 
# 1. Rust installed
# 2. 'cross' installed (cargo install cross)
# 3. Docker running (for Linux/macOS cross-compilation)

$Version = (Get-Content Cargo.toml | Select-String "^version = ""(.*)""" | ForEach-Object { $_.Matches.Groups[1].Value })
Write-Host "🚀 Building qtex v$Version for multiple platforms..." -ForegroundColor Cyan

$ReleaseDir = "releases"
if (!(Test-Path $ReleaseDir)) { New-Item -ItemType Directory -Path $ReleaseDir }

# 1. Windows (Native)
Write-Host "📦 Building Windows x64..." -ForegroundColor Green
cargo build --release --target x86_64-pc-windows-msvc
Copy-Item "target\x86_64-pc-windows-msvc\release\qtex.exe" "$ReleaseDir\qtex-windows-x64.exe"

# 2. Linux (using cross)
if (Get-Command cross -ErrorAction SilentlyContinue) {
    Write-Host "📦 Building Linux x64 (glibc) via cross..." -ForegroundColor Green
    cross build --release --target x86_64-unknown-linux-gnu
    Copy-Item "target\x86_64-unknown-linux-gnu\release\qtex" "$ReleaseDir\qtex-linux-x64"

    Write-Host "📦 Building Linux x64 (musl) via cross..." -ForegroundColor Green
    cross build --release --target x86_64-unknown-linux-musl
    Copy-Item "target\x86_64-unknown-linux-musl\release\qtex" "$ReleaseDir\qtex-linux-x64-musl"
} else {
    Write-Host "⚠️  'cross' not found. Skipping Linux builds. (cargo install cross)" -ForegroundColor Yellow
}

# Note: macOS builds from Windows are complex even with cross. 
# Usually best to let GitHub Actions handle macOS or build on a Mac.

Write-Host "`n✅ Local builds (Windows) completed in $ReleaseDir/" -ForegroundColor Green
Write-Host "Next step: git tag v$Version; git push origin main --tags" -ForegroundColor Cyan
