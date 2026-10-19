import os
import sys
import time
import json
import uuid
import queue
import logging
import asyncio
import threading
import subprocess
import mimetypes
from typing import Optional, Dict, Any, List, Callable
from telethon import TelegramClient
from telethon.tl.types import (
    DocumentAttributeVideo,
    DocumentAttributeAudio,
    DocumentAttributeFilename
)
from telethon.errors import (
    SessionPasswordNeededError,
    PhoneNumberInvalidError,
    PhoneCodeInvalidError,
    PhoneCodeExpiredError,
    PasswordHashInvalidError
)
import config

logger = logging.getLogger("TorCloud.Telegram")

SETTINGS_FILE = os.path.join(config.BASE_DIR, "telegram_settings.json")

VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.3gp', '.ts', '.flv', '.wmv'}
AUDIO_EXTENSIONS = {'.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wav', '.wma', '.m4b'}


def load_settings() -> Dict[str, Any]:
    defaults = {
        "api_id": getattr(config, "TELEGRAM_API_ID", 0),
        "api_hash": getattr(config, "TELEGRAM_API_HASH", ""),
        "bot_token": getattr(config, "TELEGRAM_BOT_TOKEN", ""),
        "default_chat": getattr(config, "TELEGRAM_DEFAULT_CHAT", "me"),
        "session_name": getattr(config, "TELEGRAM_SESSION_NAME", "torcloud_telethon")
    }
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r") as f:
                data = json.load(f)
                defaults.update(data)
        except Exception as e:
            logger.warning(f"Error loading telegram_settings.json: {e}")
    return defaults


def save_settings(settings: Dict[str, Any]):
    current = load_settings()
    current.update(settings)
    try:
        temp_file = SETTINGS_FILE + f".tmp.{uuid.uuid4().hex[:6]}"
        with open(temp_file, "w") as f:
            json.dump(current, f, indent=2)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp_file, SETTINGS_FILE)
    except Exception as e:
        logger.error(f"Error saving telegram_settings.json: {e}")
        if 'temp_file' in locals() and os.path.exists(temp_file):
            try:
                os.remove(temp_file)
            except Exception:
                pass


def extract_media_info(file_path: str) -> Dict[str, Any]:
    """
    Extracts duration, dimensions, and generates a thumbnail for videos/audios.
    Used to upload videos to Telegram with full streamable embed attributes.
    """
    ext = os.path.splitext(file_path)[1].lower()
    is_video = ext in VIDEO_EXTENSIONS
    is_audio = ext in AUDIO_EXTENSIONS

    info = {
        "is_video": is_video,
        "is_audio": is_audio,
        "duration": 0,
        "width": 1280 if is_video else 0,
        "height": 720 if is_video else 0,
        "title": os.path.basename(file_path),
        "performer": "TorCloud",
        "thumb_path": None
    }

    if not is_video and not is_audio:
        return info

    # 1. Try ffprobe for high-accuracy duration, dimensions and tags
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-show_entries", "stream=width,height,duration:format=duration,tags",
            "-of", "json",
            file_path
        ]
        res = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
            timeout=15
        )
        if res.returncode == 0:
            data = json.loads(res.stdout)
            streams = data.get("streams", [])
            fmt = data.get("format", {})
            tags = fmt.get("tags", {}) or {}

            if tags.get("title"):
                info["title"] = str(tags.get("title"))
            if tags.get("artist") or tags.get("author"):
                info["performer"] = str(tags.get("artist") or tags.get("author"))

            dur = 0.0
            if fmt.get("duration"):
                try:
                    dur = float(fmt["duration"])
                except Exception:
                    pass

            for s in streams:
                if s.get("width") and s.get("height"):
                    info["width"] = int(s["width"])
                    info["height"] = int(s["height"])
                if dur <= 0 and s.get("duration"):
                    try:
                        dur = float(s["duration"])
                    except Exception:
                        pass

            info["duration"] = int(dur)
    except Exception as e:
        logger.debug(f"ffprobe extraction fallback: {e}")

    # 2. Fallback to hachoir if duration or dimensions still missing
    if (info["duration"] == 0 or (is_video and info["width"] == 0)):
        try:
            import hachoir.parser
            import hachoir.metadata
            parser = hachoir.parser.createParser(file_path)
            if parser:
                with parser:
                    metadata = hachoir.metadata.extractMetadata(parser)
                    if metadata:
                        if metadata.has("duration") and info["duration"] == 0:
                            info["duration"] = int(metadata.get("duration").seconds)
                        if metadata.has("width") and info["width"] == 0:
                            info["width"] = int(metadata.get("width"))
                        if metadata.has("height") and info["height"] == 0:
                            info["height"] = int(metadata.get("height"))
        except Exception as e:
            logger.debug(f"hachoir extraction fallback: {e}")

    # 3. Generate high-quality JPEG thumbnail for video
    if is_video:
        try:
            thumb_dir = os.path.join(config.BASE_DIR, "thumbnails")
            os.makedirs(thumb_dir, exist_ok=True)
            thumb_path = os.path.join(thumb_dir, f"thumb_{uuid.uuid4().hex[:8]}.jpg")
            seek_pos = min(1.0, (info["duration"] / 2.0) if info["duration"] > 0 else 0.5)
            thumb_cmd = [
                "ffmpeg", "-y",
                "-ss", f"{seek_pos:.2f}",
                "-i", file_path,
                "-vframes", "1",
                "-vf", "scale='min(640,iw)':-2",
                "-q:v", "2",
                thumb_path
            ]
            subprocess.run(
                thumb_cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                timeout=15
            )
            if os.path.exists(thumb_path) and os.path.getsize(thumb_path) > 0:
                info["thumb_path"] = thumb_path
        except Exception as e:
            logger.debug(f"Thumbnail generation error: {e}")

    return info


class TelegramService:
    def __init__(self):
        self._auth_cache = {}  # {phone: phone_code_hash}
        self._status_cache = None
        self._status_cache_time = 0

    def _get_session_path(self, session_name: str) -> str:
        if os.path.isabs(session_name):
            return session_name
        return os.path.join(config.BASE_DIR, session_name)

    async def _create_client(self) -> Optional[TelegramClient]:
        settings = load_settings()
        api_id = settings.get("api_id")
        api_hash = settings.get("api_hash")
        session_name = settings.get("session_name", "torcloud_telethon")
        
        if not api_id or not api_hash:
            return None
            
        try:
            api_id = int(api_id)
        except ValueError:
            return None

        session_path = self._get_session_path(session_name)
        client = TelegramClient(session_path, api_id, api_hash)
        await client.connect()
        return client

    def get_status_sync(self) -> Dict[str, Any]:
        """Synchronously check authorization and user details"""
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(self.get_status())
        finally:
            loop.close()

    async def get_status(self) -> Dict[str, Any]:
        settings = load_settings()
        api_id = settings.get("api_id")
        api_hash = settings.get("api_hash")

        if not api_id or not api_hash:
            return {
                "configured": False,
                "authorized": False,
                "message": "API ID and API Hash not set.",
                "default_chat": settings.get("default_chat", "me")
            }

        now = time.time()
        # Return memory cache if recently checked within 25 seconds
        if self._status_cache and (now - self._status_cache_time < 25):
            cached = dict(self._status_cache)
            cached["default_chat"] = settings.get("default_chat", "me")
            return cached

        client = None
        try:
            client = await self._create_client()
            if not client:
                return {
                    "configured": False,
                    "authorized": False,
                    "message": "Invalid API ID or Hash.",
                    "default_chat": settings.get("default_chat", "me")
                }

            is_auth = await client.is_user_authorized()
            if not is_auth:
                status = {
                    "configured": True,
                    "authorized": False,
                    "message": "Client not authorized. Login required.",
                    "default_chat": settings.get("default_chat", "me")
                }
                self._status_cache = status
                self._status_cache_time = now
                return status

            me = await client.get_me()
            name = (me.first_name or "") + (" " + me.last_name if me.last_name else "")
            status = {
                "configured": True,
                "authorized": True,
                "id": me.id,
                "username": me.username or "",
                "name": name.strip() or me.username or str(me.id),
                "is_bot": me.bot,
                "default_chat": settings.get("default_chat", "me")
            }
            self._status_cache = status
            self._status_cache_time = now
            return status
        except Exception as e:
            logger.warning(f"Error checking Telegram status: {e}")
            if self._status_cache:
                cached = dict(self._status_cache)
                cached["default_chat"] = settings.get("default_chat", "me")
                return cached
            return {
                "configured": True,
                "authorized": False,
                "message": str(e),
                "default_chat": settings.get("default_chat", "me")
            }
        finally:
            if client:
                await client.disconnect()

    async def send_code_request(self, phone: str) -> Dict[str, Any]:
        client = await self._create_client()
        if not client:
            return {"success": False, "error": "API credentials missing or invalid"}

        try:
            result = await client.send_code_request(phone)
            self._auth_cache[phone] = result.phone_code_hash
            return {"success": True, "phone_code_hash": result.phone_code_hash}
        except PhoneNumberInvalidError:
            return {"success": False, "error": "Invalid phone number format."}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            await client.disconnect()

    async def sign_in_code(self, phone: str, code: str, password: Optional[str] = None) -> Dict[str, Any]:
        client = await self._create_client()
        if not client:
            return {"success": False, "error": "API credentials missing or invalid"}

        phone_code_hash = self._auth_cache.get(phone)
        try:
            try:
                await client.sign_in(phone=phone, code=code, phone_code_hash=phone_code_hash)
            except SessionPasswordNeededError:
                if not password:
                    return {"success": False, "two_factor_required": True, "message": "Two-step verification password required."}
                await client.sign_in(password=password)
            except (PhoneCodeInvalidError, PhoneCodeExpiredError) as pe:
                return {"success": False, "error": str(pe)}
            except PasswordHashInvalidError:
                return {"success": False, "error": "Invalid two-step password."}

            me = await client.get_me()
            name = (me.first_name or "") + (" " + me.last_name if me.last_name else "")
            return {
                "success": True,
                "message": f"Successfully signed in as {name.strip() or me.username or me.id}",
                "user": {
                    "id": me.id,
                    "username": me.username or "",
                    "name": name.strip() or me.username or str(me.id)
                }
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            await client.disconnect()

    async def sign_in_bot(self, bot_token: str) -> Dict[str, Any]:
        settings = load_settings()
        api_id = settings.get("api_id")
        api_hash = settings.get("api_hash")
        session_name = settings.get("session_name", "torcloud_telethon")

        if not api_id or not api_hash:
            return {"success": False, "error": "API ID and Hash must be set first"}

        session_path = self._get_session_path(session_name)
        client = TelegramClient(session_path, int(api_id), api_hash)
        await client.connect()
        try:
            await client.sign_in(bot_token=bot_token)
            me = await client.get_me()
            save_settings({"bot_token": bot_token})
            return {
                "success": True,
                "message": f"Bot authorized as @{me.username}",
                "bot": {"id": me.id, "username": me.username}
            }
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            await client.disconnect()

    async def logout(self) -> Dict[str, Any]:
        client = await self._create_client()
        if client:
            try:
                if await client.is_user_authorized():
                    await client.log_out()
            except Exception as e:
                logger.warning(f"Error during logout: {e}")
            finally:
                await client.disconnect()

        settings = load_settings()
        session_path = self._get_session_path(settings.get("session_name", "torcloud_telethon") + ".session")
        if os.path.exists(session_path):
            try:
                os.remove(session_path)
            except Exception as e:
                logger.warning(f"Failed to delete session file: {e}")
        self._status_cache = None
        self._status_cache_time = 0
        return {"success": True}

    def upload_content_sync(self, path: str, chat_target: str,
                            progress_callback: Optional[Callable[[int, int, str, str], None]] = None,
                            log_callback: Optional[Callable[[str], None]] = None,
                            is_cancelled: Optional[Callable[[], bool]] = None,
                            delete_after_each: bool = False) -> Dict[str, Any]:
        """Runs the upload inside an asyncio event loop synchronously for worker threads"""
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(
                self.upload_content(path, chat_target, progress_callback, log_callback, is_cancelled, delete_after_each)
            )
        finally:
            loop.close()

    async def upload_content(self, path: str, chat_target: str,
                             progress_callback: Optional[Callable[[int, int, str, str], None]] = None,
                             log_callback: Optional[Callable[[str], None]] = None,
                             is_cancelled: Optional[Callable[[], bool]] = None,
                             delete_after_each: bool = False) -> Dict[str, Any]:
        """
        Uploads local files or directories to Telegram with full streamable video & audio attributes,
        thumbnail generation, and embed link calculation.
        """
        client = await self._create_client()
        if not client:
            if log_callback:
                log_callback("Telegram is not configured. Please set API ID and API Hash.")
            return {"success": False, "media": []}

        try:
            is_auth = await client.is_user_authorized()
            if not is_auth:
                if log_callback:
                    log_callback("Telegram client is not authorized. Please log in.")
                return {"success": False, "media": []}

            # Resolve entity target
            target = chat_target.strip() if chat_target else "me"
            if target.lstrip("-").isdigit():
                entity = int(target)
            else:
                entity = target

            # Resolve target username for web links & embeds if available
            chat_username = None
            chat_id = None
            try:
                ent = await client.get_entity(entity)
                if hasattr(ent, "username") and ent.username:
                    chat_username = ent.username
                if hasattr(ent, "id"):
                    chat_id = ent.id
            except Exception:
                if isinstance(target, str) and not target.lstrip("-").isdigit() and target.lower() != "me":
                    chat_username = target.lstrip("@")

            # Gather files to upload
            files_to_upload = []
            if os.path.isfile(path):
                files_to_upload.append(path)
            elif os.path.isdir(path):
                for root, _, files in os.walk(path):
                    for f in sorted(files):
                        files_to_upload.append(os.path.join(root, f))

            if not files_to_upload:
                if log_callback:
                    log_callback("No files found to upload to Telegram.")
                return {"success": False, "media": []}

            total_files = len(files_to_upload)
            if log_callback:
                log_callback(f"Found {total_files} file(s) to send to Telegram target: {target}")

            from downloader import format_bytes, format_seconds

            uploaded_media = []

            for idx, file_path in enumerate(files_to_upload):
                if is_cancelled and is_cancelled():
                    if log_callback:
                        log_callback("Telegram upload cancelled.")
                    return {"success": False, "media": uploaded_media, "cancelled": True}

                filename = os.path.basename(file_path)
                file_size = os.path.getsize(file_path)

                # Check Telegram 2GB limit (2000 MB)
                if file_size > 2000 * 1024 * 1024:
                    if log_callback:
                        log_callback(f"WARNING: '{filename}' is larger than 2GB ({file_size / (1024*1024):.1f} MB). Telegram upload might fail if account is not Telegram Premium.")

                # Extract media attributes (duration, resolution, thumbnail) for streamable playback
                media_info = extract_media_info(file_path)
                attributes = []
                supports_streaming = False
                thumb = None

                if media_info["is_video"]:
                    supports_streaming = True
                    thumb = media_info.get("thumb_path")
                    w = media_info.get("width") or 1280
                    h = media_info.get("height") or 720
                    dur = media_info.get("duration") or 1
                    attributes.append(DocumentAttributeVideo(
                        duration=dur,
                        w=w,
                        h=h,
                        supports_streaming=True
                    ))
                    if log_callback:
                        log_callback(f"[{idx+1}/{total_files}] Preparing streamable video '{filename}' ({w}x{h}, {dur}s)...")
                elif media_info["is_audio"]:
                    dur = media_info.get("duration") or 0
                    title = media_info.get("title") or filename
                    performer = media_info.get("performer") or "TorCloud"
                    attributes.append(DocumentAttributeAudio(
                        duration=dur,
                        title=title,
                        performer=performer
                    ))
                    if log_callback:
                        log_callback(f"[{idx+1}/{total_files}] Preparing streamable audio '{filename}' ({dur}s)...")
                else:
                    if log_callback:
                        log_callback(f"[{idx+1}/{total_files}] Uploading '{filename}'...")

                last_time = time.time()
                last_bytes = 0

                def _prog(current, total):
                    nonlocal last_time, last_bytes
                    if is_cancelled and is_cancelled():
                        raise asyncio.CancelledError("Upload cancelled by user")

                    now = time.time()
                    elapsed = now - last_time
                    speed_str = "0 B/s"
                    eta_str = "--"

                    if elapsed >= 0.8 and total > 0:
                        speed = (current - last_bytes) / elapsed if elapsed > 0 else 0
                        last_time = now
                        last_bytes = current

                        speed_str = f"⬆ {format_bytes(speed)}/s"
                        remaining = total - current
                        if speed > 0:
                            eta_secs = int(remaining / speed)
                            eta_str = format_seconds(eta_secs)

                    if progress_callback:
                        progress_callback(current, total, speed_str, eta_str)

                caption = f"⚡ {filename}\n📦 Size: {file_size / (1024*1024):.1f} MB\n🚀 Sent via TorCloud (Streamable)"

                try:
                    msg = await client.send_file(
                        entity,
                        file_path,
                        caption=caption,
                        progress_callback=_prog,
                        supports_streaming=supports_streaming,
                        attributes=attributes if attributes else None,
                        thumb=thumb,
                        force_document=False
                    )
                finally:
                    # Clean up generated thumbnail even if upload fails or is cancelled
                    if thumb and os.path.exists(thumb):
                        try:
                            os.remove(thumb)
                        except Exception:
                            pass

                msg_id = getattr(msg, "id", None)
                if not msg_id and hasattr(msg, "message"):
                    msg_id = getattr(msg.message, "id", None)

                # Calculate web links and embed codes
                tme_url = ""
                embed_url = ""
                embed_code = ""

                if chat_username and msg_id:
                    tme_url = f"https://t.me/{chat_username}/{msg_id}"
                    embed_url = f"https://t.me/{chat_username}/{msg_id}?embed=1"
                    embed_code = f'<iframe src="{embed_url}" width="100%" height="450" frameborder="0" scrolling="no" allowfullscreen></iframe>'
                elif chat_id and msg_id:
                    cid_str = str(abs(chat_id))
                    if cid_str.startswith("100"):
                        cid_str = cid_str[3:]
                    tme_url = f"https://t.me/c/{cid_str}/{msg_id}"
                elif msg_id:
                    tme_url = f"tg://openmessage?message_id={msg_id}"

                player_url = f"/player/telegram/{target}/{msg_id}" if msg_id else ""
                stream_url = f"/api/telegram/stream/{target}/{msg_id}" if msg_id else ""
                torcloud_embed = f'<iframe src="{player_url}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>' if player_url else ""

                item_info = {
                    "id": msg_id,
                    "filename": filename,
                    "size": file_size,
                    "is_streamable": supports_streaming or media_info["is_audio"],
                    "is_video": media_info["is_video"],
                    "is_audio": media_info["is_audio"],
                    "duration": media_info["duration"],
                    "dimensions": f"{media_info['width']}x{media_info['height']}" if media_info["is_video"] else None,
                    "chat_target": str(target),
                    "tme_url": tme_url,
                    "embed_url": embed_url,
                    "embed_code": embed_code or torcloud_embed,
                    "torcloud_embed": torcloud_embed,
                    "player_url": player_url,
                    "stream_url": stream_url
                }
                uploaded_media.append(item_info)

                if log_callback:
                    if media_info["is_video"]:
                        log_callback(f"🎬 '{filename}' uploaded as Streamable Video! (Res: {media_info['width']}x{media_info['height']}, {media_info['duration']}s)")
                    elif media_info["is_audio"]:
                        log_callback(f"🎵 '{filename}' uploaded as Streamable Audio!")
                    else:
                        log_callback(f"✅ Successfully uploaded '{filename}' to Telegram!")

                    if tme_url:
                        log_callback(f"🔗 Telegram Link: {tme_url}")
                    if embed_url:
                        log_callback(f"📺 Streamable Embed: {embed_url}")

                # If delete_after_each is enabled (Telegram mode buffer), purge local file immediately
                if delete_after_each and os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                        if log_callback:
                            log_callback(f"🧹 Purged local cache for '{filename}' ({file_size / (1024*1024):.1f} MB freed).")
                    except Exception as del_err:
                        logger.debug(f"Could not purge local file {file_path}: {del_err}")

            return {"success": True, "media": uploaded_media}

        except Exception as e:
            logger.exception(f"Telegram upload failed: {e}")
            if log_callback:
                log_callback(f"Telegram upload error: {str(e)}")
            return {"success": False, "media": []}
        finally:
            await client.disconnect()

    async def get_message_media_info(self, chat_target: str, msg_id: int) -> Optional[Dict[str, Any]]:
        """Retrieves metadata of a media message for streaming and embed rendering."""
        client = await self._create_client()
        if not client:
            return None
        try:
            is_auth = await client.is_user_authorized()
            if not is_auth:
                return None
            target = chat_target.strip() if chat_target else "me"
            entity = int(target) if target.lstrip("-").isdigit() else target
            msg = await client.get_messages(entity, ids=msg_id)
            if not msg or not msg.media or not hasattr(msg, "file") or not msg.file:
                return None

            file = msg.file
            filename = file.name or f"telegram_file_{msg_id}"
            size = file.size or 0
            mime_type = file.mime_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"

            is_video = False
            is_audio = False
            duration = 0
            w = 0
            h = 0

            if hasattr(file, "duration") and file.duration:
                duration = file.duration
            if hasattr(file, "width") and file.width:
                w = file.width
            if hasattr(file, "height") and file.height:
                h = file.height

            ext = os.path.splitext(filename)[1].lower()
            if mime_type.startswith("video/") or ext in VIDEO_EXTENSIONS:
                is_video = True
            elif mime_type.startswith("audio/") or ext in AUDIO_EXTENSIONS:
                is_audio = True

            chat_username = None
            if hasattr(msg.chat, "username") and msg.chat.username:
                chat_username = msg.chat.username
            elif isinstance(target, str) and not target.lstrip("-").isdigit() and target.lower() != "me":
                chat_username = target.lstrip("@")

            tme_url = f"https://t.me/{chat_username}/{msg_id}" if chat_username else ""
            embed_url = f"https://t.me/{chat_username}/{msg_id}?embed=1" if chat_username else ""
            torcloud_embed = f'<iframe src="/player/telegram/{target}/{msg_id}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>'

            return {
                "id": msg_id,
                "filename": filename,
                "size": size,
                "mime_type": mime_type,
                "is_video": is_video,
                "is_audio": is_audio,
                "is_streamable": is_video or is_audio,
                "duration": duration,
                "width": w,
                "height": h,
                "chat_target": str(target),
                "tme_url": tme_url,
                "embed_url": embed_url,
                "embed_code": f'<iframe src="{embed_url}" width="100%" height="450" frameborder="0" scrolling="no" allowfullscreen></iframe>' if embed_url else torcloud_embed,
                "torcloud_embed": torcloud_embed,
                "player_url": f"/player/telegram/{target}/{msg_id}",
                "stream_url": f"/api/telegram/stream/{target}/{msg_id}"
            }
        except Exception as e:
            logger.error(f"Error fetching message media info {msg_id}: {e}")
            return None
        finally:
            await client.disconnect()

    async def get_recent_media(self, chat_target: str, limit: int = 30) -> List[Dict[str, Any]]:
        """Lists recent media files from Telegram for easy streaming and embed code generation."""
        client = await self._create_client()
        if not client:
            return []
        try:
            is_auth = await client.is_user_authorized()
            if not is_auth:
                return []
            target = chat_target.strip() if chat_target else "me"
            entity = int(target) if target.lstrip("-").isdigit() else target

            chat_username = None
            try:
                ent = await client.get_entity(entity)
                if hasattr(ent, "username") and ent.username:
                    chat_username = ent.username
            except Exception:
                if isinstance(target, str) and not target.lstrip("-").isdigit() and target.lower() != "me":
                    chat_username = target.lstrip("@")

            items = []
            async for msg in client.iter_messages(entity, limit=limit):
                if not msg or not msg.media or not hasattr(msg, "file") or not msg.file:
                    continue

                f = msg.file
                filename = f.name or f"file_{msg.id}"
                mime = f.mime_type or mimetypes.guess_type(filename)[0] or "application/octet-stream"
                ext = os.path.splitext(filename)[1].lower()
                is_v = mime.startswith("video/") or ext in VIDEO_EXTENSIONS
                is_a = mime.startswith("audio/") or ext in AUDIO_EXTENSIONS

                tme_url = f"https://t.me/{chat_username}/{msg.id}" if chat_username else ""
                embed_url = f"https://t.me/{chat_username}/{msg.id}?embed=1" if chat_username else ""
                torcloud_embed = f'<iframe src="/player/telegram/{target}/{msg.id}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>'

                from downloader import format_bytes
                items.append({
                    "id": msg.id,
                    "filename": filename,
                    "size": f.size or 0,
                    "size_str": format_bytes(f.size or 0),
                    "mime_type": mime,
                    "is_video": is_v,
                    "is_audio": is_a,
                    "is_streamable": is_v or is_a,
                    "duration": getattr(f, "duration", 0) or 0,
                    "date": msg.date.strftime("%Y-%m-%d %H:%M:%S") if msg.date else "",
                    "chat_target": str(target),
                    "tme_url": tme_url,
                    "embed_url": embed_url,
                    "embed_code": f'<iframe src="{embed_url}" width="100%" height="450" frameborder="0" scrolling="no" allowfullscreen></iframe>' if embed_url else torcloud_embed,
                    "torcloud_embed": torcloud_embed,
                    "player_url": f"/player/telegram/{target}/{msg.id}",
                    "stream_url": f"/api/telegram/stream/{target}/{msg.id}"
                })
            return items
        except Exception as e:
            logger.error(f"Error fetching recent telegram media: {e}")
            return []
        finally:
            await client.disconnect()

    def stream_message_media(self, chat_target: str, msg_id: int, offset: int = 0, limit: Optional[int] = None):
        """
        Yields chunks of the message media over an HTTP stream.
        Runs an asyncio loop in a background thread and yields items via a thread-safe Queue.
        Stops cleanly if the consumer disconnects or closes the generator.
        """
        q = queue.Queue(maxsize=8)
        sentinel = object()
        stop_event = threading.Event()
        exception_holder = []
        chunk_size = 256 * 1024  # 256 KB chunks

        def runner():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

            async def worker():
                client = await self._create_client()
                if not client:
                    raise RuntimeError("Telegram client could not be created")
                try:
                    target = chat_target.strip() if chat_target else "me"
                    entity = int(target) if target.lstrip("-").isdigit() else target
                    msg = await client.get_messages(entity, ids=msg_id)
                    if not msg or not msg.media:
                        raise FileNotFoundError(f"No media found for message {msg_id}")

                    async for chunk in client.iter_download(
                        msg.media,
                        offset=offset,
                        limit=limit,
                        request_size=524288,
                        chunk_size=chunk_size
                    ):
                        if stop_event.is_set():
                            break
                        while not stop_event.is_set():
                            try:
                                q.put(chunk, timeout=0.4)
                                break
                            except queue.Full:
                                continue
                finally:
                    await client.disconnect()

            try:
                loop.run_until_complete(worker())
            except Exception as e:
                exception_holder.append(e)
            finally:
                q.put(sentinel)
                loop.close()

        t = threading.Thread(target=runner, daemon=True)
        t.start()

        try:
            while True:
                item = q.get()
                if item is sentinel:
                    break
                yield item
        finally:
            stop_event.set()

        if exception_holder:
            logger.warning(f"Error streaming telegram media {msg_id}: {exception_holder[0]}")


telegram_service = TelegramService()
