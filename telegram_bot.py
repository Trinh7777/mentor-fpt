"""Module Telegram Bot cho Mentor FPT (Mô hình B).
Tự động chạy ngầm khi có TELEGRAM_BOT_TOKEN (trong biến môi trường hoặc .streamlit/secrets.toml).
Sinh viên có thể đăng nhập trên Telegram bằng cú pháp:
    /login SE190456 123456
và hỏi trực tiếp mọi câu hỏi (GPA, giả lập điểm kỳ, dự đoán năm tốt nghiệp, lịch học, điểm danh, quy chế).
"""

import json
import os
import threading
import time
import urllib.request
import urllib.error

from advisor import StudentAdvisor
from database import verify_student_credentials
import fallback

_TG_STARTED = False
_TG_LOCK = threading.Lock()
# Lưu phiên đăng nhập của từng Telegram chat_id -> student_id
_TG_SESSIONS = {}


def get_telegram_token() -> str:
    tok = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
    if tok:
        return tok
    try:
        import streamlit as st
        return st.secrets.get("TELEGRAM_BOT_TOKEN", "").strip()
    except Exception:
        return ""


def _tg_api(token: str, method: str, payload: dict) -> dict:
    url = f"https://api.telegram.org/bot{token}/{method}"
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=25) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _handle_message(token: str, api_key: str, chat_id: int, text: str):
    clean = (text or "").strip()
    if not clean:
        return

    if clean.startswith("/start"):
        msg = (
            "🎓 *Chào mừng bạn đến với Mentor FPT (Telegram Bot)!*\n\n"
            "Để bảo mật thông tin học vụ cá nhân, vui lòng liên kết tài khoản sinh viên của bạn bằng lệnh:\n"
            "`/login <MSSV> <Mật_khẩu>`\n\n"
            "Ví dụ: `/login SE190456 123456`"
        )
        _tg_api(token, "sendMessage", {"chat_id": chat_id, "text": msg, "parse_mode": "Markdown"})
        return

    if clean.startswith("/login"):
        parts = clean.split()
        if len(parts) < 3:
            _tg_api(token, "sendMessage", {
                "chat_id": chat_id,
                "text": "⚠️ Sai cú pháp. Vui lòng nhập: `/login <MSSV> <Mật_khẩu>`",
                "parse_mode": "Markdown"
            })
            return
        sid, err = verify_student_credentials(parts[1], parts[2])
        if err:
            _tg_api(token, "sendMessage", {"chat_id": chat_id, "text": f"❌ {err}"})
        else:
            _TG_SESSIONS[chat_id] = sid
            adv = StudentAdvisor(sid)
            _tg_api(token, "sendMessage", {
                "chat_id": chat_id,
                "text": f"✅ Đăng nhập thành công: *{adv.student['full_name']}* (`{sid}` - Kỳ {adv.student['current_semester']}).\nBạn có thể hỏi bất kỳ câu hỏi nào về GPA, dự báo tốt nghiệp, điểm FE, lịch học ngay tại đây!",
                "parse_mode": "Markdown"
            })
        return

    sid = _TG_SESSIONS.get(chat_id)
    if not sid:
        _tg_api(token, "sendMessage", {
            "chat_id": chat_id,
            "text": "🔐 Bạn chưa đăng nhập. Hãy gõ `/login <MSSV> <Mật_khẩu>` trước nhé (VD: `/login SE190456 123456`).",
            "parse_mode": "Markdown"
        })
        return

    adv = StudentAdvisor(sid)
    try:
        if api_key:
            from llm import GeminiAgent
            agent = GeminiAgent(api_key)
            ans, _ = agent.respond([], clean, adv)
        else:
            ans, _ = fallback.answer(clean, adv)
    except Exception:
        ans, _ = fallback.answer(clean, adv)

    try:
        _tg_api(token, "sendMessage", {"chat_id": chat_id, "text": ans, "parse_mode": "Markdown"})
    except Exception:
        _tg_api(token, "sendMessage", {"chat_id": chat_id, "text": ans})


def _polling_loop(token: str, api_key: str):
    offset = 0
    while True:
        try:
            res = _tg_api(token, "getUpdates", {"offset": offset, "timeout": 15})
            for upd in res.get("result", []):
                offset = upd["update_id"] + 1
                msg = upd.get("message") or {}
                chat_id = (msg.get("chat") or {}).get("id")
                text = msg.get("text")
                if chat_id and text:
                    _handle_message(token, api_key, chat_id, text)
        except Exception:
            time.sleep(5)


def start_telegram_bot_if_configured(api_key: str = "") -> bool:
    global _TG_STARTED
    token = get_telegram_token()
    if not token:
        return False
    with _TG_LOCK:
        if _TG_STARTED:
            return True
        t = threading.Thread(target=_polling_loop, args=(token, api_key), daemon=True, name="TelegramBotThread")
        t.start()
        _TG_STARTED = True
        return True
