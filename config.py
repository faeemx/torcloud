import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_DIR = os.path.join(BASE_DIR, "downloads")
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")

# Default settings
DEFAULT_REMOTE = "gdrive:"
DEFAULT_DEST_FOLDER = "TorCloud"
MAX_CONCURRENT_DOWNLOADS = 2
PORT = 5000
HOST = "0.0.0.0"

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
