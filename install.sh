#!/usr/bin/env bash
# ==============================================================================
#  TorCloud: One-Command Automated Linux Installer
# ==============================================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
ORANGE='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Helper for sudo
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
if [ "$PKG_MANAGER" = "apt" ]; then
    $SUDO apt-get update -y
    $SUDO apt-get install -y python3 python3-pip python3-venv git curl aria2 ffmpeg
elif [ "$PKG_MANAGER" = "dnf" ]; then
    $SUDO dnf install -y python3 python3-pip git curl aria2 ffmpeg
elif [ "$PKG_MANAGER" = "pacman" ]; then
    $SUDO pacman -Sy --noconfirm python python-pip git curl aria2 ffmpeg
elif [ "$PKG_MANAGER" = "yum" ]; then
    $SUDO yum install -y python3 python3-pip git curl aria2 ffmpeg
else
    echo -e "${ORANGE}Warning:${NC} Unknown package manager. Please ensure python3, pip, aria2, and git are installed."
fi

# Install rclone if missing
if ! command -v rclone >/dev/null 2>&1; then
    echo -e "${BLUE}==>${NC} Installing rclone..."
    curl https://rclone.org/install.sh | $SUDO bash
else
    echo -e "${GREEN}✓${NC} rclone is already installed ($(rclone version | head -n 1))."
fi

# Target directory
INSTALL_DIR="$HOME/torcloud"
if [ -d "$PWD/.git" ] && [ -f "$PWD/app.py" ]; then
    INSTALL_DIR="$PWD"
    echo -e "${BLUE}==>${NC} Installing directly into current directory: $INSTALL_DIR"
else
    if [ ! -d "$INSTALL_DIR" ]; then
        echo -e "${BLUE}==>${NC} Cloning TorCloud repository into $INSTALL_DIR..."
        git clone https://github.com/faeemx/torcloud.git "$INSTALL_DIR"
    else
        echo -e "${BLUE}==>${NC} Updating existing repository in $INSTALL_DIR..."
        cd "$INSTALL_DIR" && git pull || true
    fi
fi

cd "$INSTALL_DIR"

# Install Python requirements
echo -e "${BLUE}==>${NC} Installing Python dependencies..."
python3 -m pip install --user --upgrade pip >/dev/null 2>&1 || true
python3 -m pip install --user -r requirements.txt || pip3 install --break-system-packages -r requirements.txt || pip3 install -r requirements.txt

# Ensure executable scripts
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
