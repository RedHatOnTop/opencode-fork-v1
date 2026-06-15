#!/usr/bin/env bash
# opencode-fork-v1 Bash Installer
# One-liner for friends:
# curl -fsSL https://raw.githubusercontent.com/RedHatOnTop/opencode-fork-v1/dev/install.sh | bash
#
# Or with wget:
# wget -qO- https://raw.githubusercontent.com/RedHatOnTop/opencode-fork-v1/dev/install.sh | bash

set -euo pipefail

REPO_URL="https://github.com/RedHatOnTop/opencode-fork-v1"
BRANCH="dev"
INSTALL_DIR="${HOME}/.opencode-fork"
BIN_NAME="opencode-mod"

# ── Colors ──────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

step()   { echo -e "\n${CYAN}[*] $1${NC}"; }
ok()     { echo -e "${GREEN}[+] $1${NC}"; }
err()    { echo -e "${RED}[!] $1${NC}"; }
warn()   { echo -e "${YELLOW}[!] $1${NC}"; }

# ── Banner ──────────────────────────────────────────────────────────────
echo ""
echo -e "  ${MAGENTA}╔═══════════════════════════════════════════╗"
echo -e "  ║   opencode-fork-v1 Installer (Linux/mac)  ║"
echo -e "  ╚═══════════════════════════════════════════╝${NC}"

# ── OS Detection ────────────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
    Linux)  PLATFORM="linux" ;;
    Darwin) PLATFORM="macos" ;;
    *)      err "Unsupported OS: $OS. This script supports Linux and macOS only."
            exit 1 ;;
esac

case "$ARCH" in
    x86_64|amd64)   ARCH_NORM="x64" ;;
    aarch64|arm64)  ARCH_NORM="arm64" ;;
    *)              err "Unsupported architecture: $ARCH"
                    exit 1 ;;
esac

ok "Detected: $PLATFORM ($ARCH_NORM)"

# ── 1. Check / Install Bun ─────────────────────────────────────────────
step "Checking for Bun runtime..."

if command -v bun &>/dev/null; then
    BUN_VER="$(bun --version 2>/dev/null || echo 'unknown')"
    ok "Bun $BUN_VER found."
else
    step "Bun not found. Installing Bun..."
    if command -v curl &>/dev/null; then
        curl -fsSL https://bun.sh/install | bash
    elif command -v wget &>/dev/null; then
        wget -qO- https://bun.sh/install | bash
    else
        err "Neither curl nor wget found. Please install one and re-run."
        exit 1
    fi

    # Source bun into current shell
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"

    if command -v bun &>/dev/null; then
        ok "Bun installed successfully."
    else
        err "Bun installation may have failed."
        err "Please install Bun manually from https://bun.sh and re-run."
        exit 1
    fi
fi

# ── 2. Check for Git ───────────────────────────────────────────────────
step "Checking for Git..."

if ! command -v git &>/dev/null; then
    err "Git is not installed."
    case "$PLATFORM" in
        linux)
            err "Install with: sudo apt install git  OR  sudo dnf install git"
            ;;
        macos)
            err "Install Xcode Command Line Tools: xcode-select --install"
            ;;
    esac
    exit 1
fi
ok "Git found."

# ── 3. Check for build essentials ──────────────────────────────────────
step "Checking build prerequisites..."

if [ "$PLATFORM" = "linux" ]; then
    # Check for basic build tools needed by native modules
    if ! command -v cc &>/dev/null && ! command -v gcc &>/dev/null; then
        warn "C compiler not found. Native modules may fail to build."
        warn "Install with: sudo apt install build-essential"
    fi
fi
ok "Prerequisites check passed."

# ── 4. Clone or Update Repository ──────────────────────────────────────
step "Setting up repository at $INSTALL_DIR..."

if [ -d "$INSTALL_DIR/.git" ]; then
    step "Existing installation found. Pulling latest changes..."
    cd "$INSTALL_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
    ok "Repository updated."
else
    # Remove stale directory if it exists
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
    fi

    step "Cloning repository (branch: $BRANCH)..."
    git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
    ok "Repository cloned."
fi

cd "$INSTALL_DIR"

# ── 5. Install Dependencies ────────────────────────────────────────────
step "Installing dependencies..."
bun install
ok "Dependencies installed."

# ── 6. Build CLI Binary ────────────────────────────────────────────────
step "Building opencode CLI..."
cd packages/opencode
bun run build
ok "Build complete."

# ── 7. Create Symlink ──────────────────────────────────────────────────
step "Installing opencode-fork command..."

# Find the built binary
BIN_PATH=""
if [ -f "$INSTALL_DIR/packages/opencode/bin/opencode-mod" ]; then
    BIN_PATH="$INSTALL_DIR/packages/opencode/bin/opencode-mod"
elif [ -f "$INSTALL_DIR/packages/opencode/bin/opencode-mod-linux-$ARCH_NORM" ]; then
    BIN_PATH="$INSTALL_DIR/packages/opencode/bin/opencode-mod-linux-$ARCH_NORM"
elif [ -f "$INSTALL_DIR/packages/opencode/bin/opencode-mod-darwin-$ARCH_NORM" ]; then
    BIN_PATH="$INSTALL_DIR/packages/opencode/bin/opencode-mod-darwin-$ARCH_NORM"
else
    # Search for any opencode-mod binary in the bin directory
    BIN_PATH="$(find "$INSTALL_DIR/packages/opencode/bin" -name 'opencode-mod*' -type f 2>/dev/null | head -1 || true)"
fi

if [ -z "$BIN_PATH" ]; then
    err "Could not find built binary. Check the build output above."
    exit 1
fi

chmod +x "$BIN_PATH"

# Create symlink in a suitable location
SYMLINK_DIR="${HOME}/.local/bin"
SYMLINK_PATH="${SYMLINK_DIR}/opencode-fork"

mkdir -p "$SYMLINK_DIR"

# Remove old symlink if it exists
if [ -L "$SYMLINK_PATH" ] || [ -f "$SYMLINK_PATH" ]; then
    rm -f "$SYMLINK_PATH"
fi

ln -s "$BIN_PATH" "$SYMLINK_PATH"
ok "Symlink created: $SYMLINK_PATH -> $BIN_PATH"

# Check if symlink dir is in PATH
if [[ ":$PATH:" != *":$SYMLINK_DIR:"* ]]; then
    step "Adding $SYMLINK_DIR to PATH..."

    # Determine shell config file
    SHELL_RC=""
    if [ -n "${ZSH_VERSION:-}" ]; then
        SHELL_RC="${HOME}/.zshrc"
    elif [ -n "${BASH_VERSION:-}" ]; then
        SHELL_RC="${HOME}/.bashrc"
        # On macOS, use .bash_profile for login shells
        if [ "$PLATFORM" = "macos" ]; then
            if [ -f "${HOME}/.bash_profile" ]; then
                SHELL_RC="${HOME}/.bash_profile"
            fi
        fi
    fi

    if [ -n "$SHELL_RC" ]; then
        echo "" >> "$SHELL_RC"
        echo "# Added by opencode-fork-v1 installer" >> "$SHELL_RC"
        echo "export PATH=\"\$HOME/.local/bin:\$PATH\"" >> "$SHELL_RC"
        ok "Added to $SHELL_RC"
    fi

    export PATH="$SYMLINK_DIR:$PATH"
    ok "PATH updated for current session."
fi

# ── 8. Success ─────────────────────────────────────────────────────────
echo ""
echo -e "  ${GREEN}╔═══════════════════════════════════════════╗"
echo -e "  ║          Installation Complete!            ║"
echo -e "  ╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${YELLOW}Usage:${NC}"
echo "    opencode-fork            # Start opencode"
echo "    opencode-fork --help     # Show help"
echo ""
echo -e "  ${YELLOW}Config:${NC}  ${HOME}/.opencode/config.json"
echo -e "  ${YELLOW}Install:${NC} $INSTALL_DIR"
echo ""
echo -e "  ${YELLOW}NOTE:${NC} Run \`source ~/.bashrc\` (or \`source ~/.zshrc\`) or open a new terminal."
echo ""
