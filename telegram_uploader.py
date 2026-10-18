import os
import sys
import time
import json
import asyncio
import logging
from typing import Optional, Dict, Any, Callable
from telethon import TelegramClient
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
        with open(SETTINGS_FILE, "w") as f:
            json.dump(current, f, indent=2)
    except Exception as e:
        logger.error(f"Error saving telegram_settings.json: {e}")


class TelegramService:
    def __init__(self):
        self._auth_cache = {}  # {phone: phone_code_hash}

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
                return {
                    "configured": True,
                    "authorized": False,
                    "message": "Client not authorized. Login required.",
                    "default_chat": settings.get("default_chat", "me")
                }

            me = await client.get_me()
            name = (me.first_name or "") + (" " + me.last_name if me.last_name else "")
            return {
                "configured": True,
                "authorized": True,
                "id": me.id,
                "username": me.username or "",
                "name": name.strip() or me.username or str(me.id),
                "is_bot": me.bot,
                "default_chat": settings.get("default_chat", "me")
            }
        except Exception as e:
            logger.error(f"Error checking Telegram status: {e}")
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
                    return {"success": False, "requires_password": True, "error": "2FA password required."}
                await client.sign_in(password=password)

            me = await client.get_me()
            return {"success": True, "username": me.username, "id": me.id}
        except PhoneCodeInvalidError:
            return {"success": False, "error": "Invalid verification code."}
        except PhoneCodeExpiredError:
            return {"success": False, "error": "Verification code expired. Request a new one."}
        except PasswordHashInvalidError:
            return {"success": False, "requires_password": True, "error": "Invalid 2FA password."}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            await client.disconnect()

    async def sign_in_bot(self, bot_token: str) -> Dict[str, Any]:
        settings = load_settings()
        settings["bot_token"] = bot_token
        save_settings(settings)

        client = await self._create_client()
        if not client:
            return {"success": False, "error": "API credentials missing or invalid"}

        try:
            await client.start(bot_token=bot_token)
            me = await client.get_me()
            return {"success": True, "username": me.username, "name": me.first_name, "is_bot": True}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            await client.disconnect()

    async def logout(self) -> Dict[str, Any]:
        client = await self._create_client()
        if client:
            try:
                await client.log_out()
            except Exception:
                pass
            await client.disconnect()
            
        settings = load_settings()
        session_file = self._get_session_path(settings.get("session_name", "torcloud_telethon")) + ".session"
        if os.path.exists(session_file):
            try:
                os.remove(session_file)
            except Exception as e:
                logger.warning(f"Failed to delete session file: {e}")
        return {"success": True}

    def upload_content_sync(self, path: str, chat_target: str,
                            progress_callback: Optional[Callable[[int, int, str, str], None]] = None,
                            log_callback: Optional[Callable[[str], None]] = None) -> bool:
        """Runs the upload inside an asyncio event loop synchronously for worker threads"""
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(
                self.upload_content(path, chat_target, progress_callback, log_callback)
            )
        finally:
            loop.close()

    async def upload_content(self, path: str, chat_target: str,
                             progress_callback: Optional[Callable[[int, int, str, str], None]] = None,
                             log_callback: Optional[Callable[[str], None]] = None) -> bool:
        client = await self._create_client()
        if not client:
            if log_callback:
                log_callback("Telegram is not configured. Please set API ID and API Hash.")
            return False

        try:
            is_auth = await client.is_user_authorized()
            if not is_auth:
                if log_callback:
                    log_callback("Telegram client is not authorized. Please log in.")
                return False

            # Resolve entity target
            target = chat_target.strip() if chat_target else "me"
            if target.lstrip("-").isdigit():
                entity = int(target)
            else:
                entity = target

            # Gather files to upload
            files_to_upload = []
            if os.path.isfile(path):
                files_to_upload.append(path)
            elif os.path.isdir(path):
                for root, _, files in os.walk(path):
                    for f in files:
                        files_to_upload.append(os.path.join(root, f))

            if not files_to_upload:
                if log_callback:
                    log_callback("No files found to upload to Telegram.")
                return False

            total_files = len(files_to_upload)
            if log_callback:
                log_callback(f"Found {total_files} file(s) to send to Telegram target: {target}")

            for idx, file_path in enumerate(files_to_upload):
                filename = os.path.basename(file_path)
                file_size = os.path.getsize(file_path)
                
                # Check Telegram 2GB limit (2000 MB)
                if file_size > 2000 * 1024 * 1024:
                    if log_callback:
                        log_callback(f"WARNING: '{filename}' is larger than 2GB ({file_size / (1024*1024):.1f} MB). Telegram upload might fail if account is not Telegram Premium.")

                if log_callback:
                    log_callback(f"[{idx+1}/{total_files}] Uploading '{filename}'...")

                last_time = time.time()
                last_bytes = 0

                def _prog(current, total):
                    nonlocal last_time, last_bytes
                    now = time.time()
                    elapsed = now - last_time
                    speed_str = "0 B/s"
                    eta_str = "--"
                    
                    if elapsed >= 0.8 and total > 0:
                        speed = (current - last_bytes) / elapsed if elapsed > 0 else 0
                        last_time = now
                        last_bytes = current
                        
                        from downloader import format_bytes, format_seconds
                        speed_str = f"⬆ {format_bytes(speed)}/s"
                        remaining = total - current
                        if speed > 0:
                            eta_secs = int(remaining / speed)
                            eta_str = format_seconds(eta_secs)

                    if progress_callback:
                        progress_callback(current, total, speed_str, eta_str)

                caption = f"⚡ {filename}\n📦 Size: {file_size / (1024*1024):.1f} MB\n🚀 Sent via TorCloud"
                
                await client.send_file(
                    entity,
                    file_path,
                    caption=caption,
                    progress_callback=_prog,
                    force_document=False
                )

                if log_callback:
                    log_callback(f"Successfully uploaded '{filename}' to Telegram!")

            return True

        except Exception as e:
            logger.exception(f"Telegram upload failed: {e}")
            if log_callback:
                log_callback(f"Telegram upload error: {str(e)}")
            return False
        finally:
            await client.disconnect()


telegram_service = TelegramService()
