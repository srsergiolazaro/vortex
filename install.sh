#!/bin/bash

set -e

# --- Configuration ---
INSTALL_DIR="$HOME/.qtex"
BIN_DIR="$INSTALL_DIR/bin"
BINARY_NAME="qtex"
REPO="srsergiolazaro/qtex"

# --- Colors ---
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
GREEN='\033[0;32m'
BOLD='\033[1m'
RESET='\033[0m'

echo -e "${MAGENTA}${BOLD}🌀 qtex Installer${RESET}\n"

# 1. Detect OS and Architecture
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
    darwin)
        if [ "$ARCH" = "arm64" ]; then
            ASSET_NAME="qtex-darwin-arm64"
        else
            ASSET_NAME="qtex-darwin-x64"
        fi
        ;;
    linux)
        ASSET_NAME="qtex-linux-x64"
        ;;
    *)
        echo -e "❌ Unsupported OS: $OS. Please install manually or use Windows installer."
        exit 1
        ;;
esac

# 2. Create installation directory
mkdir -p "$BIN_DIR"

# 3. Download binary from GitHub
echo -e "${BLUE}🚚 Downloading $ASSET_NAME from GitHub...${RESET}"
URL="https://github.com/$REPO/releases/latest/download/$ASSET_NAME"

# Note: In a real scenario, if the release doesn't exist yet, this might fail.
# For local dev testing, we could fallback to local build if needed, 
# but the request asks for the "git downloader" style.
if ! curl -sSL -o "$BIN_DIR/$BINARY_NAME" "$URL"; then
    echo -e "⚠️  Could not download from GitHub. Falling back to local build if Bun is present..."
    if command -v bun &> /dev/null; then
        bun run compile > /dev/null
        cp qtex-bin "$BIN_DIR/$BINARY_NAME"
    else
        echo -e "❌ Download failed and Bun is not installed. Cannot proceed."
        exit 1
    fi
fi

chmod +x "$BIN_DIR/$BINARY_NAME"

# 4. Add to PATH automatically
SHELL_CONFIG=""
case $SHELL in
    */zsh)
        SHELL_CONFIG="$HOME/.zshrc"
        ;;
    */bash)
        SHELL_CONFIG="$HOME/.bashrc"
        ;;
    *)
        # Try to guess common ones if $SHELL is weird
        if [ -f "$HOME/.zshrc" ]; then SHELL_CONFIG="$HOME/.zshrc";
        elif [ -f "$HOME/.bashrc" ]; then SHELL_CONFIG="$HOME/.bashrc";
        fi
        ;;
esac

if [ -n "$SHELL_CONFIG" ]; then
    if ! grep -q "$BIN_DIR" "$SHELL_CONFIG"; then
        echo -e "${BLUE}⚙️  Adding $BIN_DIR to PATH in $SHELL_CONFIG...${RESET}"
        echo "" >> "$SHELL_CONFIG"
        echo "# qtex binary" >> "$SHELL_CONFIG"
        echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$SHELL_CONFIG"
        export PATH="$PATH:$BIN_DIR"
    else
        echo -e "✅ $BIN_DIR is already in your PATH."
    fi
fi

echo -e "\n${GREEN}${BOLD}✨ qtex installed successfully!${RESET}"
echo -e "Please run ${BOLD}source $SHELL_CONFIG${RESET} (or restart your terminal) to start using 'qtex'."
echo -e "Usage example: ${BLUE}qtex ./example --watch${RESET}"
