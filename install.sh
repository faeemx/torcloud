#!/usr/bin/env bash
# ==============================================================================
#  TorCloud: One-Command Automated Linux Installer
# ==============================================================================

# Wrap in main function so bash buffers the entire script before execution,
# preventing stdin corruption when running via `curl ... | bash`.
main() {
    set -e

    RED='\033[0;31m'
    GREEN='\033[0;32m'
    ORANGE='\033[0;33m'
    BLUE='\033[0;34m'
    NC='\033[0m' # No Color

    # Suppress Google Cloud Shell apt warning prompt if in Cloud Shell
    mkdir -p "$HOME/.cloudshell" 2>/dev/null || true
    touch "$HOME/.cloudshell/no-apt-get-warning" 2>/dev/null || true

    echo -e "${ORANGE}"
    cat << "EOF"
  _______           _____ _                 _ 
 |__   __|         / ____| |               | |
    | | ___  _ __ | |    | | ___  _   _  __| |
    | |/ _ \| '__|| |    | |/ _ \| | | |/ _` |
    | | (_) | |   | |____| | (_) | |_| | (_| |
    |_|\___/|_|    \_____|_|\___/ \__,_|\__,_|
   Cloud Downloader & Storage Sync (Drive & TG)
EOF
    echo -e "${NC}"

    echo -e "${BLUE}==>${NC} Starting TorCloud installation on Linux..."

    # Determine sudo privilege
    SUDO=""
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo >/dev/null 2>&1; then
            SUDO="sudo"
        else
            echo -e "${RED}Error:${NC} Root privileges or sudo required to install dependencies."
            exit 1
        fi
    fi

    # Detect package manager
    PKG_MANAGER=""
    if command -v apt-get >/dev/null 2>&1; then
        PKG_MANAGER="apt"
    elif command -v dnf >/dev/null 2>&1; then
        PKG_MANAGER="dnf"
    elif command -v pacman >/dev/null 2>&1; then
        PKG_MANAGER="pacman"
    elif command -v yum >/dev/null 2>&1; then
        PKG_MANAGER="yum"
    fi

    echo -e "${BLUE}==>${NC} Installing system prerequisites (aria2, python3, curl, git)..."
    export DEBIAN_FRONTEND=noninteractive

    if [ "$PKG_MANAGER" = "apt" ]; then
        $SUDO apt-get update -y < /dev/null
        $SUDO apt-get install -y python3 python3-pip python3-venv git curl aria2 rclone ffmpeg < /dev/null
    elif [ "$PKG_MANAGER" = "dnf" ]; then
        $SUDO dnf install -y python3 python3-pip git curl aria2 rclone ffmpeg < /dev/null
    elif [ "$PKG_MANAGER" = "pacman" ]; then
        $SUDO pacman -Sy --noconfirm python python-pip git curl aria2 rclone ffmpeg < /dev/null
    elif [ "$PKG_MANAGER" = "yum" ]; then
        $SUDO yum install -y python3 python3-pip git curl aria2 rclone ffmpeg < /dev/null
    else
        echo -e "${ORANGE}Warning:${NC} Unknown package manager. Please ensure python3, pip, aria2, and git are installed."
    fi

    # Install rclone from official source if still missing
    if ! command -v rclone >/dev/null 2>&1; then
        echo -e "${BLUE}==>${NC} Installing official rclone..."
        curl -fsSL https://rclone.org/install.sh | $SUDO bash < /dev/null || true
    else
        echo -e "${GREEN}✓${NC} rclone is installed ($(rclone version 2>/dev/null | head -n 1 || echo 'rclone OK'))."
    fi

    # Target directory setup
    INSTALL_DIR="$HOME/torcloud"
    if [ -d "$PWD/.git" ] && [ -f "$PWD/app.py" ]; then
        INSTALL_DIR="$PWD"
        echo -e "${BLUE}==>${NC} Installing directly into current directory: $INSTALL_DIR"
    else
        if [ ! -d "$INSTALL_DIR" ]; then
            echo -e "${BLUE}==>${NC} Cloning TorCloud repository into $INSTALL_DIR..."
            git clone https://github.com/faeemx/torcloud.git "$INSTALL_DIR" < /dev/null
        else
            echo -e "${BLUE}==>${NC} Updating existing repository in $INSTALL_DIR..."
            cd "$INSTALL_DIR" && git pull < /dev/null || true
        fi
    fi

    cd "$INSTALL_DIR"

    # Install Python requirements
    echo -e "${BLUE}==>${NC} Installing Python dependencies..."
    if [ ! -d "venv" ]; then
        python3 -m venv venv 2>/dev/null || true
    fi
    if [ -f "venv/bin/activate" ]; then
        source venv/bin/activate
        pip install --upgrade pip >/dev/null 2>&1 || true
        pip install -r requirements.txt
    else
        python3 -m pip install --user --upgrade pip >/dev/null 2>&1 < /dev/null || true
        python3 -m pip install --user -r requirements.txt < /dev/null || \
            pip3 install --break-system-packages -r requirements.txt < /dev/null || \
            pip3 install -r requirements.txt < /dev/null
    fi

    # Ensure executable permissions and directories
    chmod +x run.sh login_telegram.py install.sh || true
    mkdir -p downloads

    echo ""
    echo -e "${GREEN}====================================================${NC}"
    echo -e "${GREEN}   ✓ TorCloud Successfully Installed!               ${NC}"
    echo -e "${GREEN}====================================================${NC}"
    echo ""

    # Check rclone remotes
    REMOTES=$(rclone listremotes 2>/dev/null || true)
    if [ -z "$REMOTES" ]; then
        echo -e "${ORANGE}Note:${NC} No rclone remotes detected."
        echo -e "To connect your Google Drive, run:"
        echo -e "   ${BLUE}rclone config${NC} (create a remote named '${ORANGE}gdrive${NC}')"
        echo ""
    else
        echo -e "${GREEN}✓${NC} Detected rclone remotes: ${BLUE}$REMOTES${NC}"
    fi

    echo -e "To start the TorCloud web server:"
    echo -e "   ${BLUE}cd $INSTALL_DIR && ./run.sh${NC}"
    echo ""
    echo -e "Then open ${GREEN}http://localhost:5000${NC} in your browser."
    echo ""
}

# Run main with all arguments
main "$@"
