import os
import re
import sys
import time
import json
import uuid
import shutil
import queue
import logging
import threading
import subprocess
from datetime import datetime
from typing import Any, Dict, List, Optional, Callable
import config
from telegram_uploader import telegram_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("TorCloud")

def format_bytes(bytes_val: Optional[float]) -> str:
    if bytes_val is None or bytes_val <= 0:
        return "0 B"
    units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
    val = float(bytes_val)
    for u in units:
        if val < 1024.0 or u == 'PB':
            return f"{val:.2f} {u}"
        val /= 1024.0
    return f"{val:.2f} PB"

def format_seconds(seconds: Optional[int]) -> str:
    if seconds is None or seconds < 0:
        return "--"
    if seconds < 60:
        return f"{seconds}s"
    minutes = seconds // 60
    rem_seconds = seconds % 60
    if minutes < 60:
        return f"{minutes}m {rem_seconds:02d}s"
    hours = minutes // 60
    rem_minutes = minutes % 60
    return f"{hours}h {rem_minutes:02d}m"


class Task:
    def __init__(self, task_id: str, source: str, source_type: str, dest_folder: str = "",
                 remote: str = config.DEFAULT_REMOTE, name: str = "", mode: str = "auto",
                 upload_target: str = "gdrive", telegram_chat: str = ""):
        self.id = task_id
        self.source = source
        self.source_type = source_type  # 'url', 'torrent_file', 'upload'
        self.dest_folder = dest_folder.strip("/\\") if dest_folder else config.DEFAULT_DEST_FOLDER
        self.remote = remote or config.DEFAULT_REMOTE
        self.name = name or self._infer_name(source)
        self.mode = mode  # 'auto', 'aria2', 'ytdlp', 'upload'
        self.upload_target = upload_target  # 'gdrive', 'telegram', 'both'
        self.telegram_chat = telegram_chat or ""
        self.telegram_media: List[Dict[str, Any]] = []
        
        self.status = "queued"  # queued, downloading, uploading, completed, failed, cancelled
        self.phase = "queued"   # queued, downloading, uploading, completed
        self.progress = 0.0     # 0.0 - 100.0
        self.speed = "0 B/s"
        self.eta = "--"
        self.downloaded_bytes = 0
        self.total_bytes = 0
        self.downloaded_size_str = "0 B"
        self.total_size_str = "0 B"
        
        self.error_message = ""
        self.logs: List[str] = []
        self._log_lock = threading.Lock()
        self.created_at = time.time()
        self.completed_at = None
        self.local_dir = os.path.join(config.DOWNLOAD_DIR, self.id)
        
        self.process: Optional[subprocess.Popen] = None
        self.cancelled = False

    def _infer_name(self, source: str) -> str:
        if source.startswith("magnet:"):
            # Extract dn parameter if present
            match = re.search(r"dn=([^&]+)", source)
            if match:
                import urllib.parse
                return urllib.parse.unquote_plus(match.group(1))
            return "Magnet Download"
        
        # Check if URL
        if source.startswith(("http://", "https://", "ftp://")):
            clean_url = source.split("?")[0].split("#")[0]
            base = os.path.basename(clean_url.rstrip("/"))
            return base if base else "Web Download"
        
        # File upload
        return os.path.basename(source)

    def append_log(self, text: str):
        line = text.strip()
        if not line:
            return
        with self._log_lock:
            if len(self.logs) >= 80:
                self.logs.pop(0)
            self.logs.append(line)

    def _safe_logs(self) -> List[str]:
        """Thread-safe snapshot of the last 20 log lines."""
        with self._log_lock:
            return list(self.logs[-20:])

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "source": self.source if not self.source.startswith("magnet:") else self.source[:60] + "...",
            "source_type": self.source_type,
            "dest_folder": self.dest_folder,
            "remote": self.remote,
            "mode": self.mode,
            "upload_target": self.upload_target,
            "telegram_chat": self.telegram_chat,
            "status": self.status,
            "phase": self.phase,
            "progress": round(self.progress, 1),
            "speed": self.speed,
            "eta": self.eta,
            "downloaded_bytes": self.downloaded_bytes,
            "total_bytes": self.total_bytes,
            "downloaded_size_str": self.downloaded_size_str,
            "total_size_str": self.total_size_str,
            "error_message": self.error_message,
            "logs": self._safe_logs(),
            "telegram_media": self.telegram_media,
            "created_at": datetime.fromtimestamp(self.created_at).strftime("%Y-%m-%d %H:%M:%S"),
            "completed_at": datetime.fromtimestamp(self.completed_at).strftime("%Y-%m-%d %H:%M:%S") if self.completed_at else None
        }


class DownloaderManager:
    def __init__(self):
        self.tasks: Dict[str, Task] = {}
        self.lock = threading.RLock()
        self.task_queue = queue.Queue()
        self.workers: List[threading.Thread] = []
        self._start_workers()

    def _start_workers(self):
        for i in range(config.MAX_CONCURRENT_DOWNLOADS):
            t = threading.Thread(target=self._worker_loop, name=f"Worker-{i+1}", daemon=True)
            t.start()
            self.workers.append(t)
        logger.info(f"Started {config.MAX_CONCURRENT_DOWNLOADS} background workers.")

    def add_url_task(self, url: str, dest_folder: str = "", mode: str = "auto",
                     upload_target: str = "gdrive", telegram_chat: str = "") -> Task:
        task_id = str(uuid.uuid4())[:8]
        is_magnet = url.startswith("magnet:")
        is_torrent_url = url.split("?")[0].endswith(".torrent")
        source_type = "torrent" if (is_magnet or is_torrent_url) else "url"
        
        task = Task(task_id=task_id, source=url, source_type=source_type,
                    dest_folder=dest_folder, mode=mode,
                    upload_target=upload_target, telegram_chat=telegram_chat)
        
        with self.lock:
            self.tasks[task.id] = task
        self.task_queue.put(task.id)
        logger.info(f"Task {task.id} added (source: {task.name}, mode: {mode}, target: {upload_target})")
        return task

    def add_upload_task(self, filename: str, temp_filepath: str, dest_folder: str = "",
                        upload_target: str = "gdrive", telegram_chat: str = "") -> Task:
        task_id = str(uuid.uuid4())[:8]
        is_torrent = filename.lower().endswith(".torrent")
        source_type = "torrent" if is_torrent else "upload"
        mode = "aria2" if is_torrent else "upload"
        
        task = Task(task_id=task_id, source=filename, source_type=source_type,
                    dest_folder=dest_folder, name=filename, mode=mode,
                    upload_target=upload_target, telegram_chat=telegram_chat)
        
        # Place uploaded file in task download directory
        os.makedirs(task.local_dir, exist_ok=True)
        dest_path = os.path.join(task.local_dir, filename)
        shutil.move(temp_filepath, dest_path)
        
        if is_torrent:
            task.source = dest_path  # path to .torrent file for aria2c
            task.status = "queued"
            task.phase = "queued"
        else:
            # File is already on server, jump directly to upload stage
            file_size = os.path.getsize(dest_path)
            task.total_bytes = file_size
            task.downloaded_bytes = file_size
            task.downloaded_size_str = format_bytes(file_size)
            task.total_size_str = format_bytes(file_size)
            task.status = "queued"
            task.phase = "uploading"
            
        with self.lock:
            self.tasks[task.id] = task
        self.task_queue.put(task.id)
        logger.info(f"Upload Task {task.id} added ({filename}, target: {upload_target})")
        return task

    def cancel_task(self, task_id: str) -> bool:
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return False
            task.cancelled = True
            task.status = "cancelled"
            task.append_log("Task cancelled by user.")
            proc = task.process  # Grab reference under lock

        # Terminate process OUTSIDE the lock to avoid blocking other requests
        if proc and proc.poll() is None:
            try:
                proc.terminate()
                try:
                    proc.wait(timeout=2.0)
                except subprocess.TimeoutExpired:
                    proc.kill()
            except Exception as e:
                logger.warning(f"Error terminating process for {task_id}: {e}")
        self._cleanup_task_dir(task)
        return True

    def retry_task(self, task_id: str) -> bool:
        with self.lock:
            task = self.tasks.get(task_id)
            if not task or task.status not in ("failed", "cancelled"):
                return False
            task.status = "queued"
            task.phase = "queued"
            task.progress = 0.0
            task.speed = "0 B/s"
            task.eta = "--"
            task.error_message = ""
            task.cancelled = False
            task.completed_at = None
        self.task_queue.put(task.id)
        return True

    def delete_task(self, task_id: str) -> bool:
        with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return False
            if task.status in ("downloading", "uploading"):
                self.cancel_task(task_id)
            del self.tasks[task_id]
        self._cleanup_task_dir(task)
        return True

    def clear_finished(self) -> int:
        count = 0
        with self.lock:
            to_remove = [tid for tid, t in self.tasks.items() if t.status in ("completed", "failed", "cancelled")]
            for tid in to_remove:
                t = self.tasks.pop(tid)
                self._cleanup_task_dir(t)
                count += 1
        return count

    def get_task(self, task_id: str) -> Optional[Task]:
        with self.lock:
            return self.tasks.get(task_id)

    def get_all_tasks(self) -> List[dict]:
        with self.lock:
            # Sort newest first
            sorted_tasks = sorted(self.tasks.values(), key=lambda t: t.created_at, reverse=True)
            return [t.to_dict() for t in sorted_tasks]

    def _cleanup_task_dir(self, task: Task):
        if os.path.exists(task.local_dir):
            try:
                shutil.rmtree(task.local_dir)
            except Exception as e:
                logger.warning(f"Failed to remove {task.local_dir}: {e}")

    def _worker_loop(self):
        while True:
            try:
                task_id = self.task_queue.get()
                task = self.get_task(task_id)
                if not task or task.cancelled:
                    self.task_queue.task_done()
                    continue
                
                os.makedirs(task.local_dir, exist_ok=True)
                
                # Step 1: Download phase (unless already uploaded)
                success = True
                if task.source_type != "upload":
                    success = self._run_download(task)
                
                # Step 2: Upload phase
                if success and not task.cancelled:
                    self._run_upload(task)
                
                self.task_queue.task_done()
            except Exception as e:
                logger.exception(f"Unexpected error in worker loop: {e}")

    def _determine_download_tool(self, task: Task) -> str:
        if task.mode == "ytdlp":
            return "ytdlp"
        if task.mode == "aria2":
            return "aria2"
        
        # Auto mode detection
        if task.source.startswith("magnet:") or task.source.endswith(".torrent") or task.source_type == "torrent":
            return "aria2"
        
        # Check for media / streaming domains
        media_domains = [
            "youtube.com", "youtu.be", "vimeo.com", "tiktok.com",
            "twitter.com", "x.com", "instagram.com", "facebook.com",
            "twitch.tv", "soundcloud.com", "reddit.com", "bilibili.com"
        ]
        source_lower = task.source.lower()
        if any(d in source_lower for d in media_domains):
            return "ytdlp"
        
        return "aria2"

    def _run_download(self, task: Task) -> bool:
        tool = self._determine_download_tool(task)
        task.status = "downloading"
        task.phase = "downloading"
        task.append_log(f"Starting download using {tool.upper()}...")
        
        if tool == "aria2":
            return self._download_aria2(task)
        else:
            return self._download_ytdlp(task)

    def _download_aria2(self, task: Task) -> bool:
        cmd = [
            "aria2c",
            f"--dir={task.local_dir}",
            "--summary-interval=1",
            "--console-log-level=notice",
            "-x", "16",
            "-s", "16",
            "-j", "4",
            "-k", "1M",
            "--seed-time=0",
            "--follow-torrent=mem",
            "--auto-file-renaming=false",
            "--allow-overwrite=true",
            "--file-allocation=none",
            "--disk-cache=32M",
            "--check-certificate=false",
            "--bt-stop-timeout=300",
            "--max-connection-per-server=8",
            "--split=8",
        ]
        
        # In Telegram mode, dynamically pace download speed so disk cache is not overwhelmed
        if task.upload_target == "telegram":
            rate_limit = getattr(config, "TELEGRAM_STREAM_RATE_LIMIT", "8M")
            cmd.append(f"--max-download-limit={rate_limit}")
            task.append_log(f"Dynamic rate-limiting active for Telegram stream mode ({rate_limit})")

        cmd.extend(["--", task.source])
        
        task.append_log("Executing: " + " ".join(cmd[:8]) + " ...")
        
        try:
            task.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                bufsize=1
            )
            
            # Example progress line:
            # [#b70123 12MiB/50MiB(24%) CN:16 DL:4.2MiB ETA:9s]
            # [#b70123 12MiB/50MiB(24%) CN:16 SD:3 DL:4.2MiB]
            aria2_regex = re.compile(
                r'\[#\w+\s+([\d\.]+\w+)/([\d\.]+\w+)\((\d+)%\).*?DL:([\d\.]+\w+)(?:.*?ETA:(\w+))?'
            )
            
            for raw_line in task.process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                
                # Check cancellation
                if task.cancelled:
                    return False
                
                # Detect downloaded file name
                if "Download complete:" in line:
                    parts = line.split("Download complete:", 1)
                    if len(parts) > 1:
                        completed_path = parts[1].strip()
                        task.name = os.path.basename(completed_path)
                
                m = aria2_regex.search(line)
                if m:
                    dl_str, total_str, pct_str, spd_str, eta_str = m.groups()
                    task.downloaded_size_str = dl_str
                    task.total_size_str = total_str
                    task.progress = float(pct_str)
                    task.speed = f"⬇ {spd_str}/s"
                    task.eta = eta_str if eta_str else "--"
                else:
                    task.append_log(line)
            
            task.process.wait()
            rc = task.process.returncode
            if rc != 0:
                if task.cancelled:
                    return False
                task.status = "failed"
                task.error_message = f"aria2c exited with code {rc}"
                task.append_log(task.error_message)
                return False
            
            task.progress = 100.0
            task.append_log("Download completed successfully.")
            return True
            
        except Exception as e:
            if task.cancelled:
                return False
            task.status = "failed"
            task.error_message = f"Download error: {str(e)}"
            task.append_log(task.error_message)
            logger.exception(f"Error in aria2 download: {e}")
            return False

    def _download_ytdlp(self, task: Task) -> bool:
        cmd = [
            sys.executable, "-m", "yt_dlp",
            "--newline",
            "-o", os.path.join(task.local_dir, "%(title)s.%(ext)s"),
            "--no-playlist"
        ]

        if task.upload_target == "telegram":
            rate_limit = getattr(config, "TELEGRAM_STREAM_RATE_LIMIT", "8M")
            cmd.extend(["--limit-rate", rate_limit])
            task.append_log(f"Dynamic rate-limiting active for Telegram stream mode ({rate_limit})")

        cmd.extend(["--", task.source])
        
        task.append_log("Executing: yt-dlp " + task.source[:50])
        
        try:
            task.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                bufsize=1
            )
            
            # Example yt-dlp progress line:
            # [download]  45.0% of ~ 100.00MiB at  5.00MiB/s ETA 00:10
            # [download]  45.0% of 100.00MiB at  5.00MiB/s ETA 00:10
            ytdlp_regex = re.compile(
                r'\[download\]\s+([\d\.]+)%\s+of\s+~?\s*([\d\.]+\w+)\s+at\s+([\d\.]+\w+/s)\s+ETA\s+([0-9:]+)'
            )
            dest_regex = re.compile(r'\[download\] Destination:\s+(.*)')
            merger_regex = re.compile(r'\[Merger\] Merging formats into "(.*)"')
            
            for raw_line in task.process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                
                if task.cancelled:
                    return False
                
                dm = dest_regex.search(line)
                if dm:
                    task.name = os.path.basename(dm.group(1).strip())
                
                mm = merger_regex.search(line)
                if mm:
                    task.name = os.path.basename(mm.group(1).strip())
                
                m = ytdlp_regex.search(line)
                if m:
                    pct_str, total_str, spd_str, eta_str = m.groups()
                    task.progress = float(pct_str)
                    task.total_size_str = total_str
                    task.speed = f"⬇ {spd_str}"
                    task.eta = eta_str
                else:
                    task.append_log(line)
            
            task.process.wait()
            rc = task.process.returncode
            if rc != 0:
                if task.cancelled:
                    return False
                task.status = "failed"
                task.error_message = f"yt-dlp exited with code {rc}"
                task.append_log(task.error_message)
                return False
            
            task.progress = 100.0
            task.append_log("Download completed successfully.")
            return True
            
        except Exception as e:
            if task.cancelled:
                return False
            task.status = "failed"
            task.error_message = f"yt-dlp error: {str(e)}"
            task.append_log(task.error_message)
            logger.exception(f"Error in yt-dlp download: {e}")
            return False

    def _run_upload(self, task: Task) -> bool:
        if task.cancelled:
            return False

        target = task.upload_target or "gdrive"
        task.append_log(f"Starting upload phase (Target: {target.upper()})...")

        if target == "telegram":
            ok = self._upload_telegram(task)
            if ok and not task.cancelled:
                task.status = "completed"
                task.phase = "completed"
                task.progress = 100.0
                task.speed = "Done"
                task.eta = "--"
                task.completed_at = time.time()
                self._cleanup_task_dir(task)
            return ok
        elif target == "both":
            task.append_log("[1/2] Copying content to Google Drive...")
            ok_gd = self._upload_gdrive(task, action="copy")
            if not ok_gd or task.cancelled:
                return False
            task.append_log("[2/2] Sending content to Telegram...")
            ok_tg = self._upload_telegram(task)
            if ok_tg and not task.cancelled:
                task.status = "completed"
                task.phase = "completed"
                task.progress = 100.0
                task.speed = "Done"
                task.eta = "--"
                task.completed_at = time.time()
                self._cleanup_task_dir(task)
            return ok_tg
        else:  # "gdrive"
            ok = self._upload_gdrive(task, action="move")
            if ok and not task.cancelled:
                task.status = "completed"
                task.phase = "completed"
                task.progress = 100.0
                task.speed = "Done"
                task.eta = "--"
                task.completed_at = time.time()
                self._cleanup_task_dir(task)
            return ok

    def _upload_telegram(self, task: Task) -> bool:
        if task.cancelled:
            return False
        task.status = "uploading"
        task.phase = "telegram"
        task.progress = 0.0
        task.speed = "0 B/s"
        task.eta = "--"

        target_chat = task.telegram_chat or "me"
        task.append_log(f"Uploading content to Telegram (chat: {target_chat})...")

        def _on_prog(current, total, speed_str, eta_str):
            task.downloaded_bytes = current
            task.total_bytes = total
            task.downloaded_size_str = format_bytes(current)
            task.total_size_str = format_bytes(total)
            if total > 0:
                task.progress = min(100.0, (current / total) * 100.0)
            if speed_str != "0 B/s":
                task.speed = speed_str
            if eta_str != "--":
                task.eta = eta_str

        def _on_log(msg):
            task.append_log(msg)

        try:
            res = telegram_service.upload_content_sync(
                path=task.local_dir,
                chat_target=target_chat,
                progress_callback=_on_prog,
                log_callback=_on_log,
                is_cancelled=lambda: task.cancelled,
                delete_after_each=(task.upload_target == "telegram")
            )
            success = False
            if isinstance(res, dict):
                success = res.get("success", False)
                task.telegram_media = res.get("media", [])
            else:
                success = bool(res)

            if not success and not task.cancelled:
                task.status = "failed"
                if not task.error_message:
                    task.error_message = "Telegram upload failed. Check credentials/session."
            return success
        except Exception as e:
            if not task.cancelled:
                task.status = "failed"
                task.error_message = f"Telegram upload error: {str(e)}"
                task.append_log(task.error_message)
            logger.exception(f"Error in telegram upload: {e}")
            return False

    def _upload_gdrive(self, task: Task, action: str = "move") -> bool:
        if task.cancelled:
            return False
            
        task.status = "uploading"
        task.phase = "gdrive"
        task.progress = 0.0
        task.speed = "0 B/s"
        task.eta = "--"
        
        # Build destination remote path: e.g. gdrive:TorCloud/ or gdrive:TorCloud/SubFolder/
        remote_dest = f"{task.remote}{task.dest_folder}"
        if not remote_dest.endswith("/"):
            remote_dest += "/"
        
        task.append_log(f"Syncing content to Google Drive ({remote_dest})...")
        
        # Find files downloaded in task.local_dir
        items = os.listdir(task.local_dir)
        if not items:
            task.status = "failed"
            task.error_message = "No downloaded files found to upload."
            task.append_log(task.error_message)
            return False
            
        if len(items) == 1:
            task.name = items[0]
            
        cmd = [
            "rclone", action,
            task.local_dir,
            remote_dest,
            "--use-json-log",
            "--stats=1s",
            "-v"
        ]
        
        last_error_msg = ""
        try:
            task.process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                bufsize=1
            )
            
            for raw_line in task.process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                
                if task.cancelled:
                    return False
                
                if line.startswith("{") and line.endswith("}"):
                    try:
                        data = json.loads(line)
                        stats = data.get("stats")
                        if stats:
                            bytes_done = stats.get("bytes", 0)
                            total_bytes = stats.get("totalBytes", 0)
                            speed_val = stats.get("speed", 0)
                            
                            task.downloaded_bytes = bytes_done
                            task.total_bytes = total_bytes
                            task.downloaded_size_str = format_bytes(bytes_done)
                            task.total_size_str = format_bytes(total_bytes)
                            
                            if total_bytes > 0:
                                task.progress = min(100.0, (bytes_done / total_bytes) * 100.0)
                            
                            task.speed = f"⬆ {format_bytes(speed_val)}/s"
                            
                            transferring = stats.get("transferring")
                            if transferring and len(transferring) > 0:
                                eta_val = transferring[0].get("eta")
                                task.eta = format_seconds(eta_val) if eta_val is not None else "--"
                        
                        msg = data.get("msg", "")
                        if data.get("level") == "error":
                            last_error_msg = msg
                            task.append_log(f"ERROR: {msg}")
                    except Exception:
                        pass
                else:
                    if "NOTICE" not in line and "client_id" not in line:
                        task.append_log(line)
            
            task.process.wait()
            rc = task.process.returncode
            if rc != 0:
                if task.cancelled:
                    return False
                task.status = "failed"
                task.error_message = last_error_msg or f"rclone exited with code {rc}"
                task.append_log(task.error_message)
                return False
            
            task.append_log(f"Google Drive sync completed for {remote_dest}")
            return True
            
        except Exception as e:
            if task.cancelled:
                return False
            task.status = "failed"
            task.error_message = f"Upload error: {str(e)}"
            task.append_log(task.error_message)
            logger.exception(f"Error in rclone upload: {e}")
            return False

    def get_storage_info(self, remote: str = config.DEFAULT_REMOTE) -> dict:
        now = time.time()
        if hasattr(self, "_storage_cache") and (now - getattr(self, "_storage_cache_time", 0) < 15):
            return self._storage_cache

        try:
            cmd = ["rclone", "about", remote, "--json"]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
            if res.returncode == 0:
                data = json.loads(res.stdout)
                total = data.get("total", 0)
                used = data.get("used", 0)
                free = data.get("free", 0)
                trashed = data.get("trashed", 0)
                percent_used = round((used / total * 100), 1) if total > 0 else 0
                result = {
                    "connected": True,
                    "remote": remote,
                    "total_str": format_bytes(total),
                    "used_str": format_bytes(used),
                    "free_str": format_bytes(free),
                    "trashed_str": format_bytes(trashed),
                    "percent_used": percent_used,
                    "total": total,
                    "used": used,
                    "free": free
                }
                self._storage_cache = result
                self._storage_cache_time = now
                return result
            else:
                return {"connected": False, "error": res.stderr.strip(), "remote": remote}
        except Exception as e:
            # If we have an older cache, return it instead of error
            if hasattr(self, "_storage_cache"):
                return self._storage_cache
            return {"connected": False, "error": str(e), "remote": remote}

    def list_files(self, folder: str = "", remote: str = config.DEFAULT_REMOTE) -> list:
        try:
            target = f"{remote}{folder.strip('/')}"
            cmd = ["rclone", "lsjson", target]
            res = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if res.returncode == 0:
                items = json.loads(res.stdout)
                results = []
                for item in items:
                    name = item.get("Name", "")
                    mime = item.get("MimeType", "")
                    results.append({
                        "name": name,
                        "id": item.get("ID", ""),
                        "mime_type": mime,
                        "is_dir": item.get("IsDir", False),
                        "size": item.get("Size", 0),
                        "size_str": format_bytes(item.get("Size", 0)) if not item.get("IsDir") else "",
                        "mod_time": item.get("ModTime", "")[:19].replace("T", " ") if item.get("ModTime") else ""
                    })
                # Sort directories first, then by name
                results.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
                return results
            return []
        except Exception as e:
            logger.warning(f"Error listing files for {folder}: {e}")
            return []

    def get_system_storage_info(self) -> dict:
        try:
            import shutil
            download_path = config.DOWNLOAD_DIR
            usage = shutil.disk_usage(download_path)
            
            home_path = os.path.expanduser("~")
            home_usage = shutil.disk_usage(home_path)

            percent_used = round((usage.used / usage.total * 100), 1) if usage.total > 0 else 0
            home_percent = round((home_usage.used / home_usage.total * 100), 1) if home_usage.total > 0 else 0

            return {
                "download_dir": download_path,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "total_str": format_bytes(usage.total),
                "used_str": format_bytes(usage.used),
                "free_str": format_bytes(usage.free),
                "percent_used": percent_used,
                "home_free_str": format_bytes(home_usage.free),
                "home_total_str": format_bytes(home_usage.total),
                "home_percent": home_percent,
                "is_low_space": usage.free < (1024 * 1024 * 1024 * 2)  # less than 2GB free
            }
        except Exception as e:
            logger.warning(f"Error checking system storage: {e}")
            return {
                "download_dir": config.DOWNLOAD_DIR,
                "total": 0, "used": 0, "free": 0,
                "total_str": "--", "used_str": "--", "free_str": "--",
                "percent_used": 0,
                "home_free_str": "--", "home_total_str": "--", "home_percent": 0,
                "is_low_space": False
            }


# Global instance
manager = DownloaderManager()
