#!/bin/bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "=========================================="
echo " Starting TorCloud Downloader & Drive Sync "
echo "=========================================="

# Check rclone
if ! command -v rclone &> /dev/null; then
    echo "ERROR: rclone is not installed!"
    exit 1
fi

# Check aria2c
if ! command -v aria2c &> /dev/null; then
    echo "WARNING: aria2c not found. Multi-threaded torrents/downloads may be limited."
fi

# Ensure downloads directory exists
mkdir -p downloads

# Run Flask application
python3 app.py
