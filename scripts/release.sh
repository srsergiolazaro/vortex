#!/bin/bash
# qtex Release Script for macOS
# Requirements: Rust, gh (GitHub CLI), cross (cargo install cross), Docker

set -e

BUMP=${1:-patch}
CARGO_FILE="Cargo.toml"
RELEASE_DIR="releases"

# 1. Detect and Bump Version
CURRENT_VERSION=$(grep '^version =' $CARGO_FILE | sed 's/version = "\(.*\)"/\1/')
IFS='.' read -r major minor patch <<< "$CURRENT_VERSION"

if [ "$BUMP" == "major" ]; then
    major=$((major + 1)); minor=0; patch=0
elif [ "$BUMP" == "minor" ]; then
    minor=$((minor + 1)); patch=0
else
    patch=$((patch + 1))
fi

NEW_VERSION="$major.$minor.$patch"
NEW_TAG="v$NEW_VERSION"

echo "🚀 Starting Release from macOS: $CURRENT_VERSION -> $NEW_VERSION"

# 2. Update Cargo.toml
sed -i '' "s/^version = \".*\"/version = \"$NEW_VERSION\"/" $CARGO_FILE
echo "✅ Cargo.toml updated."

# 3. Build Native macOS Binaries
mkdir -p $RELEASE_DIR

echo -e "\n📦 Building macOS Native..."
cargo build --release
# Identify if we are on ARM or Intel to name it correctly
ARCH=$(uname -m)
if [ "$ARCH" == "arm64" ]; then
    cp target/release/qtex "$RELEASE_DIR/qtex-darwin-arm64"
    echo "✅ Success: macOS ARM64"
else
    cp target/release/qtex "$RELEASE_DIR/qtex-darwin-x64"
    echo "✅ Success: macOS x64"
fi

# 4. Build Linux Binaries via Cross (Docker)
echo -e "\n📦 Building Linux x64 (glibc) via cross..."
cross build --release --target x86_64-unknown-linux-gnu
cp target/x86_64-unknown-linux-gnu/release/qtex "$RELEASE_DIR/qtex-linux-x64"

echo -e "\n📦 Building Linux x64 (musl) via cross..."
cross build --release --target x86_64-unknown-linux-musl
cp target/x86_64-unknown-linux-musl/release/qtex "$RELEASE_DIR/qtex-linux-x64-musl"

# 5. Git Operations
echo -e "\n💾 Committing and tagging..."
git add .
git commit -m "chore: release $NEW_TAG"
git tag $NEW_TAG
git push origin main
git push origin $NEW_TAG

# 6. Create GitHub Release & Upload Assets
echo -e "\n🌐 Creating GitHub Release and uploading assets..."
gh release create $NEW_TAG \
    "$RELEASE_DIR/qtex-windows-x64.exe" \
    "$RELEASE_DIR/qtex-linux-x64" \
    "$RELEASE_DIR/qtex-linux-x64-musl" \
    "$RELEASE_DIR/qtex-darwin-arm64" \
    "$RELEASE_DIR/qtex-darwin-x64" \
    --title "Release $NEW_TAG" \
    --notes "Automated release $NEW_TAG from macOS" || \
gh release upload $NEW_TAG $RELEASE_DIR/* --clobber

echo -e "\n✨ Done! All binaries (including local ones) are now on GitHub."
