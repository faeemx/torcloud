import os
import re
import mimetypes
import tempfile
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, Response
import config
from downloader import manager

app = Flask(
    __name__,
    template_folder=config.TEMPLATES_DIR,
    static_folder=config.STATIC_DIR
)
app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    tasks = manager.get_all_tasks()
    return jsonify({"success": True, "tasks": tasks})


@app.route("/api/tasks/add", methods=["POST"])
def add_task():
    data = request.get_json(silent=True) or request.form
    url = data.get("url", "").strip()
    dest_folder = data.get("dest_folder", config.DEFAULT_DEST_FOLDER).strip()
    mode = data.get("mode", "auto")
    upload_target = data.get("upload_target", "gdrive").strip()
    telegram_chat = data.get("telegram_chat", "").strip()

    if not url:
        return jsonify({"success": False, "error": "URL or Magnet link is required"}), 400

    task = manager.add_url_task(
        url=url,
        dest_folder=dest_folder,
        mode=mode,
        upload_target=upload_target,
        telegram_chat=telegram_chat
    )
    return jsonify({"success": True, "task": task.to_dict()})


@app.route("/api/tasks/upload", methods=["POST"])
def upload_file():
    if "file" not in request.files:
        return jsonify({"success": False, "error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"success": False, "error": "No file selected"}), 400

    dest_folder = request.form.get("dest_folder", config.DEFAULT_DEST_FOLDER).strip()
    upload_target = request.form.get("upload_target", "gdrive").strip()
    telegram_chat = request.form.get("telegram_chat", "").strip()
    safe_name = secure_filename(file.filename) or "uploaded_file"
    
    # Save temporarily
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        file.save(tmp.name)
        temp_path = tmp.name

    task = manager.add_upload_task(
        filename=safe_name,
        temp_filepath=temp_path,
        dest_folder=dest_folder,
        upload_target=upload_target,
        telegram_chat=telegram_chat
    )
    return jsonify({"success": True, "task": task.to_dict()})


@app.route("/api/tasks/<task_id>/cancel", methods=["POST"])
def cancel_task(task_id):
    success = manager.cancel_task(task_id)
    if success:
        return jsonify({"success": True, "message": f"Task {task_id} cancelled"})
    return jsonify({"success": False, "error": "Task not found"}), 404


@app.route("/api/tasks/<task_id>/retry", methods=["POST"])
def retry_task(task_id):
    success = manager.retry_task(task_id)
    if success:
        return jsonify({"success": True, "message": f"Task {task_id} re-queued"})
    return jsonify({"success": False, "error": "Task not found or cannot be retried"}), 400


@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    success = manager.delete_task(task_id)
    if success:
        return jsonify({"success": True, "message": f"Task {task_id} deleted"})
    return jsonify({"success": False, "error": "Task not found"}), 404


@app.route("/api/tasks/clear", methods=["POST"])
def clear_tasks():
    count = manager.clear_finished()
    return jsonify({"success": True, "cleared_count": count})


@app.route("/api/gdrive/info", methods=["GET"])
def gdrive_info():
    info = manager.get_storage_info()
    return jsonify({"success": True, "info": info})


@app.route("/api/gdrive/files", methods=["GET"])
def gdrive_files():
    folder = request.args.get("folder", config.DEFAULT_DEST_FOLDER).strip()
    files = manager.list_files(folder=folder)
    return jsonify({"success": True, "folder": folder, "files": files})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy", "service": "TorCloud"})


# ================= Telegram Endpoints =================

import asyncio
from telegram_uploader import telegram_service, load_settings, save_settings

def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.route("/api/telegram/status", methods=["GET"])
def telegram_status():
    status = telegram_service.get_status_sync()
    settings = load_settings()
    status["settings"] = {
        "api_id": settings.get("api_id") or "",
        "has_api_hash": bool(settings.get("api_hash")),
        "default_chat": settings.get("default_chat", "me"),
        "has_bot_token": bool(settings.get("bot_token"))
    }
    return jsonify({"success": True, "status": status})


@app.route("/api/telegram/config", methods=["POST"])
def telegram_config():
    data = request.get_json(silent=True) or request.form
    api_id = data.get("api_id", "").strip()
    api_hash = data.get("api_hash", "").strip()
    default_chat = data.get("default_chat", "me").strip()
    
    updates = {}
    if api_id:
        try:
            updates["api_id"] = int(api_id)
        except ValueError:
            return jsonify({"success": False, "error": "API ID must be an integer."}), 400
    if api_hash:
        updates["api_hash"] = api_hash
    if default_chat:
        updates["default_chat"] = default_chat

    save_settings(updates)
    return jsonify({"success": True, "message": "Settings updated"})


@app.route("/api/telegram/send_code", methods=["POST"])
def telegram_send_code():
    data = request.get_json(silent=True) or request.form
    phone = data.get("phone", "").strip()
    if not phone:
        return jsonify({"success": False, "error": "Phone number is required."}), 400

    res = run_async(telegram_service.send_code_request(phone))
    return jsonify(res)


@app.route("/api/telegram/verify_code", methods=["POST"])
def telegram_verify_code():
    data = request.get_json(silent=True) or request.form
    phone = data.get("phone", "").strip()
    code = data.get("code", "").strip()
    password = data.get("password", "").strip() or None

    if not phone or not code:
        return jsonify({"success": False, "error": "Phone and verification code are required."}), 400

    res = run_async(telegram_service.sign_in_code(phone=phone, code=code, password=password))
    return jsonify(res)


@app.route("/api/telegram/bot_login", methods=["POST"])
def telegram_bot_login():
    data = request.get_json(silent=True) or request.form
    bot_token = data.get("bot_token", "").strip()
    if not bot_token:
        return jsonify({"success": False, "error": "Bot token is required."}), 400

    res = run_async(telegram_service.sign_in_bot(bot_token=bot_token))
    return jsonify(res)


@app.route("/api/telegram/logout", methods=["POST"])
def telegram_logout():
    res = run_async(telegram_service.logout())
    return jsonify(res)


# ================= Streamable Media & Embed Endpoints =================

@app.route("/api/telegram/recent", methods=["GET"])
def telegram_recent():
    chat = request.args.get("chat", "").strip() or None
    limit = int(request.args.get("limit", 30))
    res = run_async(telegram_service.get_recent_media(chat_target=chat, limit=limit))
    return jsonify({"success": True, "media": res})


@app.route("/api/telegram/media/<chat>/<int:msg_id>/info", methods=["GET"])
def telegram_media_info(chat, msg_id):
    info = run_async(telegram_service.get_message_media_info(chat_target=chat, msg_id=msg_id))
    if not info:
        return jsonify({"success": False, "error": "Media message not found"}), 404
    return jsonify({"success": True, "info": info})


@app.route("/api/telegram/stream/<chat>/<int:msg_id>", methods=["GET"])
def telegram_stream_media(chat, msg_id):
    info = run_async(telegram_service.get_message_media_info(chat_target=chat, msg_id=msg_id))
    if not info:
        return jsonify({"error": "Media message not found"}), 404

    file_size = info["size"]
    mime_type = info["mime_type"] or "video/mp4"
    filename = info["filename"]

    range_header = request.headers.get("Range", None)
    if not range_header:
        headers = {
            "Content-Type": mime_type,
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Disposition": f'inline; filename="{filename}"'
        }
        gen = telegram_service.stream_message_media(chat, msg_id, offset=0, limit=file_size)
        return Response(gen, 200, headers=headers)

    match = re.search(r"bytes=(\d+)-(\d*)", range_header)
    if not match:
        return Response("Invalid range", 416)

    start = int(match.group(1))
    end = int(match.group(2)) if match.group(2) else file_size - 1
    if start >= file_size or end >= file_size or start > end:
        return Response(
            "Requested range not satisfiable",
            416,
            headers={"Content-Range": f"bytes */{file_size}"}
        )

    length = end - start + 1
    headers = {
        "Content-Type": mime_type,
        "Accept-Ranges": "bytes",
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Content-Length": str(length),
        "Content-Disposition": f'inline; filename="{filename}"'
    }
    gen = telegram_service.stream_message_media(chat, msg_id, offset=start, limit=length)
    return Response(gen, 206, headers=headers)


@app.route("/player/telegram/<chat>/<int:msg_id>", methods=["GET"])
def telegram_player_view(chat, msg_id):
    info = run_async(telegram_service.get_message_media_info(chat_target=chat, msg_id=msg_id))
    if not info:
        return render_template("player.html", error="Media not found in Telegram chat or account not authorized.")
    autoplay = request.args.get("autoplay", "0") == "1"
    return render_template(
        "player.html",
        title=info["filename"],
        is_video=info["is_video"],
        is_audio=info["is_audio"],
        stream_url=f"/api/telegram/stream/{chat}/{msg_id}",
        embed_url=info.get("embed_url"),
        tme_url=info.get("tme_url"),
        autoplay=autoplay,
        source_type="telegram",
        chat=chat,
        msg_id=msg_id
    )


@app.route("/api/gdrive/stream/link", methods=["GET"])
def gdrive_stream_link():
    file_id = request.args.get("id", "").strip()
    name = request.args.get("name", "").strip()
    if not file_id:
        return jsonify({"success": False, "error": "file_id is required"}), 400

    preview_url = f"https://drive.google.com/file/d/{file_id}/preview"
    embed_code = f'<iframe src="{preview_url}" width="100%" height="480" frameborder="0" allow="autoplay; fullscreen" allowfullscreen></iframe>'

    return jsonify({
        "success": True,
        "file_id": file_id,
        "name": name,
        "preview_url": preview_url,
        "embed_code": embed_code,
        "player_url": f"/player/gdrive?id={file_id}&name={name}"
    })


@app.route("/player/gdrive", methods=["GET"])
def gdrive_player_view():
    file_id = request.args.get("id", "").strip()
    name = request.args.get("name", "Google Drive File").strip()
    if not file_id:
        return render_template("player.html", error="No Google Drive file ID provided.")

    preview_url = f"https://drive.google.com/file/d/{file_id}/preview"
    return render_template(
        "player.html",
        title=name,
        is_video=True,
        is_audio=False,
        stream_url="",
        embed_url=preview_url,
        autoplay=False,
        source_type="gdrive",
        file_id=file_id
    )


if __name__ == "__main__":
    print(f"TorCloud starting on http://{config.HOST}:{config.PORT}")
    app.run(host=config.HOST, port=config.PORT, debug=False)

