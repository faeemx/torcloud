# ⚡ TorCloud: Cloud Downloader, Google Drive & Telegram Sync

TorCloud is a high-speed Python Flask downloader and cloud sync web application. It downloads direct files, torrents/magnet links, media streams, or browser-uploaded files, and automatically uploads them straight to your **Google Drive** (via rclone) and/or **Telegram** (via Telethon)—automatically freeing up local disk space.

---

## 🌟 Key Features

- **⚡ Multi-Engine Downloader**:
  - **aria2c**: High-speed multi-threaded acceleration (16 parallel connections) for direct HTTP/HTTPS/FTP downloads, torrents, and magnet links.
  - **yt-dlp**: Download videos and audio streams from YouTube, Vimeo, TikTok, Twitch, Twitter/X, SoundCloud, Reddit, and hundreds of media platforms.
  - **Direct Uploads**: Drag-and-drop local files or `.torrent` files straight from your browser to Google Drive or Telegram.
- **☁️ Google Drive Integration (rclone)**:
  - Automatically moves completed files to your configured `gdrive:` remote.
  - Real-time Google Drive storage meter (Total, Used, Free space) and remote file browser.
- **✈️ Telegram Integration (Telethon)**:
  - Upload files directly to Telegram **Saved Messages** (`me`), any user `@username`, channel, or group chat ID.
  - Real-time upload progress tracking (`⬆ MB/s`, percentage, and ETA).
  - Flexible auth options:
    - Web UI: Phone login (+ verification code & 2FA password) or Telegram Bot Token.
    - CLI Tool: Interactive terminal authorization via `python3 login_telegram.py`.
- **🔄 Dual-Target Sync**:
  - Option to upload to **Google Drive Only**, **Telegram Only**, or **Both**.
- **🖥️ Modern Web UI**:
  - Dark mode dashboard with Tailwind CSS and Lucide icons.
  - Dynamic speed gauges, live progress bars, terminal logs modal, and task control (Cancel, Retry, Delete, Clear Finished).

---

## 🚀 Quick Start

### ⚡ One-Command Setup (Linux)

Install all system packages, Python libraries, rclone, and dependencies automatically with a single command:

```bash
curl -fsSL https://raw.githubusercontent.com/faeemx/torcloud/main/install.sh | bash
```

Once installed, start the server:
```bash
cd ~/torcloud && ./run.sh
```

---

### 🛠️ Manual Setup

If you prefer manual installation:

1. **Clone the repository**:
   ```bash
   git clone https://github.com/faeemx/torcloud.git
   cd torcloud
   ```

2. **Install prerequisites**:
   ```bash
   sudo apt-get update && sudo apt-get install -y python3 python3-pip aria2 rclone ffmpeg
   pip3 install -r requirements.txt
   ```

3. **Start the application**:
   ```bash
   ./run.sh
   # or: python3 app.py
   ```

The web interface will be accessible at:
```
http://localhost:5000
```
*(In Google Cloud Shell, click the **Web Preview** icon on port 5000)*.

---

## ✈️ Telegram Setup

### Step 1: Obtain your Telegram API credentials
1. Log in to [https://my.telegram.org](https://my.telegram.org).
2. Go to **API development tools** and create an application to get your `api_id` and `api_hash`.

### Step 2: Authorize
You can authorize using **either** method:

- **Method A: From the Web UI**:
  1. Click the **Telegram** button in the header.
  2. Enter your `API ID` and `API Hash`, then click **Save Config**.
  3. Enter your phone number (with country code, e.g. `+1234567890`) and click **Send Code**.
  4. Enter the verification code sent to your Telegram app and click **Verify Code & Authorize** (or use a Bot Token).

- **Method B: Interactive Terminal Login**:
  Run the included CLI helper:
  ```bash
  python3 login_telegram.py
  ```
  Follow the prompts to enter your phone number and verification code. Your session will be saved to `torcloud_telethon.session`.

---

## ⚙️ Configuration

Settings can be customized in [`config.py`](file:///home/faeemansariao/torcloud/config.py) or via environment variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DEFAULT_REMOTE` | `"gdrive:"` | Name of your rclone remote |
| `DEFAULT_DEST_FOLDER` | `"TorCloud"` | Target directory inside Google Drive |
| `TELEGRAM_API_ID` | `""` | Telegram API ID |
| `TELEGRAM_API_HASH` | `""` | Telegram API Hash |
| `TELEGRAM_DEFAULT_CHAT` | `"me"` | Default Telegram chat target (`me`, `@username`, channel ID) |
| `MAX_CONCURRENT_DOWNLOADS` | `2` | Simultaneous background worker threads |
| `PORT` | `5000` | Port for the web interface |
| `DOWNLOAD_DIR` | `./downloads` | Temporary download staging folder (auto-cleaned) |

---

## 📁 Project Structure

```
/home/faeemansariao/torcloud/
├── app.py                 # Flask server, routes & REST APIs
├── downloader.py          # Background worker queue & multi-engine download pipeline
├── telegram_uploader.py   # Telethon Telegram client, auth & file uploader
├── login_telegram.py      # Interactive CLI login helper for Telegram
├── config.py              # Configuration constants
├── templates/
│   └── index.html         # Responsive web UI with Drive & Telegram controls
├── static/
│   ├── css/style.css      # Styling & progress animations
│   └── js/app.js          # Polling, upload handling & interactive UI logic
├── downloads/             # Temp download staging folder (auto-cleaned)
├── requirements.txt       # Dependencies
└── run.sh                 # Startup script
```
