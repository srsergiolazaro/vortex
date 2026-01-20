# qtex Total Automation Release Script
# Usage: ./scripts/release.ps1 [patch | minor | major]

param (
    [string]$Bump = "patch"
)

$ErrorActionPreference = "Stop"

# 1. Detect and Bump Version
$CargoFile = "Cargo.toml"
$CurrentVersion = (Get-Content $CargoFile | Select-String "^version = ""(.*)""" | ForEach-Object { $_.Matches.Groups[1].Value })
$VArray = $CurrentVersion.Split(".")
[int]$Major = $VArray[0]; [int]$Minor = $VArray[1]; [int]$Patch = $VArray[2]

if ($Bump -eq "major") { $Major++; $Minor = 0; $Patch = 0 }
elseif ($Bump -eq "minor") { $Minor++; $Patch = 0 }
else { $Patch++ }

$NewVersion = "$Major.$Minor.$Patch"
$NewTag = "v$NewVersion"

Write-Host "🚀 Starting Release: $CurrentVersion -> $NewVersion" -ForegroundColor Cyan

# 2. Update Cargo.toml
(Get-Content $CargoFile) -replace "^version = `".*`"", "version = `"$NewVersion`"" | Set-Content $CargoFile
Write-Host "✅ Cargo.toml updated." -ForegroundColor Green

# 3. Build Local Binaries (Windows & Linux)
$ReleaseDir = "releases"
if (!(Test-Path $ReleaseDir)) { New-Item -ItemType Directory -Path $ReleaseDir }

Write-Host "`n📦 Building Windows x64..." -ForegroundColor Green
cargo build --release --target x86_64-pc-windows-msvc
Copy-Item "target\x86_64-pc-windows-msvc\release\qtex.exe" "$ReleaseDir\qtex-windows-x64.exe"

Write-Host "📦 Building Linux x64 (glibc) via cross..." -ForegroundColor Green
cross build --release --target x86_64-unknown-linux-gnu
Copy-Item "target\x86_64-unknown-linux-gnu\release\qtex" "$ReleaseDir\qtex-linux-x64"

Write-Host "📦 Building Linux x64 (musl) via cross..." -ForegroundColor Green
cross build --release --target x86_64-unknown-linux-musl
Copy-Item "target\x86_64-unknown-linux-musl\release\qtex" "$ReleaseDir\qtex-linux-x64-musl"

# 4. Git Operations
Write-Host "`n💾 Committing and tagging..." -ForegroundColor Cyan
git add .
git commit -m "chore: release $NewTag"
git tag $NewTag
git push origin main
git push origin $NewTag

# 5. Create GitHub Release & Upload Binaries
Write-Host "`n🌐 Creating GitHub Release and uploading local assets..." -ForegroundColor Cyan
gh release create $NewTag "$($ReleaseDir)/qtex-windows-x64.exe" "$($ReleaseDir)/qtex-linux-x64" "$($ReleaseDir)/qtex-linux-x64-musl" --title "Release $NewTag" --notes "Automated release $NewTag"

Write-Host "`n✨ Done! GitHub Actions will now build macOS binaries and add them to the release automatically." -ForegroundColor Green
Write-Host "Check progress at: https://github.com/srsergiolazaro/qtex/actions"
