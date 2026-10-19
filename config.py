import os
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

def get_optimal_download_dir():
    custom = os.environ.get("TORCLOUD_DOWNLOAD_DIR")
    if custom:
        os.makedirs(custom, exist_ok=True)
        return custom

    try:
        base_free = shutil.disk_usage(BASE_DIR).free
        tmp_free = shutil.disk_usage("/tmp").free
        # If /tmp has at least 3 GB more free space than BASE_DIR (e.g. in Cloud Shell), use high-capacity /tmp
        if tmp_free > base_free + (3 * 1024 * 1024 * 1024):
            tmp_dir = "/tmp/torcloud_downloads"
            os.makedirs(tmp_dir, exist_ok=True)
            return tmp_dir
    except Exception:
        pass

    fallback = os.path.join(BASE_DIR, "downloads")
    os.makedirs(fallback, exist_ok=True)
    return fallback

DOWNLOAD_DIR = get_optimal_download_dir()
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# Default settings
DEFAULT_REMOTE = "gdrive:"
DEFAULT_DEST_FOLDER = "TorCloud"
MAX_CONCURRENT_DOWNLOADS = 2
PORT = 5000
HOST = "0.0.0.0"

# Telegram streaming cache rate limit (dynamic download pacing for Telegram uploads)
TELEGRAM_STREAM_RATE_LIMIT = os.environ.get("TELEGRAM_STREAM_RATE_LIMIT", "8M")

# Max file upload size (e.g. 10 GB)
MAX_CONTENT_LENGTH = 10 * 1024 * 1024 * 1024

# Telegram settings
TELEGRAM_API_ID = os.environ.get("TELEGRAM_API_ID", "")
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_DEFAULT_CHAT = os.environ.get("TELEGRAM_DEFAULT_CHAT", "me")
TELEGRAM_SESSION_NAME = os.environ.get("TELEGRAM_SESSION_NAME", "torcloud_telethon")

# Ensure downloads directory exists
os.makedirs(DOWNLOAD_DIR, exist_ok=True)
