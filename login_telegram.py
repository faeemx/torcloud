#!/usr/bin/env python3
"""
Interactive CLI to authorize Telegram account with Telethon for TorCloud.
"""
import os
import sys
from telethon.sync import TelegramClient
import telegram_uploader

def main():
    print("=" * 50)
    print("      TorCloud Telegram Authorization Tool")
    print("=" * 50)
    print("Get your API ID and API Hash from https://my.telegram.org (under API development tools).\n")

    settings = telegram_uploader.load_settings()
    current_api_id = settings.get("api_id") or ""
    current_api_hash = settings.get("api_hash") or ""
    current_chat = settings.get("default_chat") or "me"

    api_id_input = input(f"Enter API ID [{current_api_id}]: ").strip()
    api_id = api_id_input if api_id_input else current_api_id

    api_hash_input = input(f"Enter API Hash [{current_api_hash}]: ").strip()
    api_hash = api_hash_input if api_hash_input else current_api_hash

    if not api_id or not api_hash:
        print("\nERROR: API ID and API Hash are required!")
        sys.exit(1)

    try:
        api_id = int(api_id)
    except ValueError:
        print("\nERROR: API ID must be a number!")
        sys.exit(1)

    chat_input = input(f"Default Telegram Target Chat (e.g. 'me', '@username', channel ID) [{current_chat}]: ").strip()
    default_chat = chat_input if chat_input else current_chat

    session_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "torcloud_telethon")
    
    print("\nConnecting to Telegram...")
    client = TelegramClient(session_path, api_id, api_hash)
    
    # client.start() prompts interactively for phone number, code, and 2FA password!
    client.start()

    me = client.get_me()
    print("\n" + "=" * 50)
    print(" SUCCESS! Logged in as:")
    print(f" Name:     {me.first_name} {me.last_name or ''}")
    print(f" Username: @{me.username or 'N/A'}")
    print(f" User ID:  {me.id}")
    print("=" * 50)

    # Save credentials
    settings["api_id"] = api_id
    settings["api_hash"] = api_hash
    settings["default_chat"] = default_chat
    telegram_uploader.save_settings(settings)
    print(f"\nConfiguration saved to telegram_settings.json.")
    print("You can now select 'Telegram' as an upload destination in the TorCloud Web UI!")

    client.disconnect()

if __name__ == "__main__":
    main()
