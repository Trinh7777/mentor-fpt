"""BƯỚC 8 - Giao diện Streamlit. Chạy:  streamlit run app.py
Gemini API key là "blackbox": chỉ đọc từ server (biến môi trường / st.secrets), người dùng không thấy và không phải nhập."""
import logging
import os
import pandas as pd
import streamlit as st

import fallback
from advisor import StudentAdvisor
from config import DEFAULT_MODEL, TUITION_PER_CREDIT
from data_loader import load_all

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("mentor_fpt")

st.set_page_config(page_title="Mentor FPT", page_icon="🎓", layout="centered")

QUICK = ["GPA của mình là bao nhiêu?", "Mình còn thiếu bao nhiêu tín chỉ?", "Kỳ sau nên đăng ký môn nào?",
         "Học lại các môn nợ hết bao nhiêu tiền?", "Muốn GPA 8.0 thì cần bao nhiêu điểm?",
         "Học lại sớm là gì?"]

# Đặt DEBUG=1 (biến môi trường) nếu muốn hiện khung "Dữ liệu đã tra" khi dev
DEBUG = os.getenv("DEBUG") == "1"

def get_api_key():
    """Key chỉ lấy từ phía server, không bao giờ hiện lên UI."""
    key = os.getenv("GEMINI_API_KEY")
    if key:
        return key
    try:
        return st.secrets.get("GEMINI_API_KEY", "")
    except Exception:
        return ""


API_KEY = get_api_key()
MODEL = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
use_llm = bool(API_KEY)   # có key -> dùng Gemini; không có -> chế độ từ khóa

# ------------------------- Sidebar -------------------------
data = load_all()
with st.sidebar:
    st.header("⚙️ Cài đặt")
    sid = st.selectbox("Sinh viên (đăng nhập giả lập)", list(data["students"]),
                       format_func=lambda x: f"{x} – {data['students'][x]['full_name']}")
    campus = st.selectbox("Cơ sở (tính học phí)", list(TUITION_PER_CREDIT))
    if st.button("🧹 Xóa cuộc trò chuyện", use_container_width=True):
        st.session_state.messages = []
        st.rerun()

adv = StudentAdvisor(sid, campus)

# Đổi sinh viên -> reset chat
if st.session_state.get("sid") != sid:
    st.session_state.sid = sid
    st.session_state.messages = []

# ------------------------- Header + dashboard -------------------------
st.title("🎓 Mentor FPT")
s = adv.student
st.caption(f"{s['full_name']} · {s['student_id']} · {s['major']} · Kỳ {s['current_semester']}")

with st.expander("📊 Tổng quan học tập", expanded=False):
    g, p = adv.gpa(), adv.progress()
    c1, c2, c3 = st.columns(3)
    c1.metric("GPA tích lũy", g["gpa"], g["classification"])
    c2.metric("Tín chỉ", f"{p['credits_passed']}/{p['credits_total']}", f"{p['percent']}%")
    c3.metric("Môn đang nợ", len(p["failed_pending_retake"]))
    st.progress(min(p["percent"] / 100, 1.0))
    if g.get("by_semester"):
        st.caption("GPA theo kỳ")
        st.bar_chart(pd.Series(g["by_semester"], name="GPA"))
    if p["failed_pending_retake"]:
        st.warning("Cần học lại: " + ", ".join(f"{i['subject_code']}" for i in p["failed_pending_retake"]))

# ------------------------- Chat -------------------------
st.session_state.setdefault("messages", [])

for m in st.session_state.messages:
    with st.chat_message(m["role"]):
        st.markdown(m["content"])
        if DEBUG and m.get("tools"):
            with st.expander("🔧 Dữ liệu đã tra"):
                for t in m["tools"]:
                    st.write(f"**{t['tool']}**", t["args"] or "")
                    st.json(t["result"], expanded=False)

if not st.session_state.messages:
    st.info(f"Chào {s['full_name'].split()[-1]} 👋 Mình là Mentor FPT. Hỏi mình về điểm, GPA, môn tiên quyết, học phí học lại hoặc quy chế nhé!")
    cols = st.columns(2)
    for i, q in enumerate(QUICK):
        if cols[i % 2].button(q, key=f"q{i}", use_container_width=True):
            st.session_state.pending = q
            st.rerun()

prompt = st.chat_input("Nhập câu hỏi...") or st.session_state.pop("pending", None)

if prompt:
    history = list(st.session_state.messages)
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)
    with st.chat_message("assistant"):
        with st.spinner("Đang suy nghĩ..."):
            try:
                if use_llm:
                    from llm import GeminiAgent
                    text, tools = GeminiAgent(API_KEY, MODEL).respond(history, prompt, adv)
                else:
                    text, tools = fallback.answer(prompt, adv)
            except Exception:  # lỗi mạng/quota/key -> ghi log ở server, người dùng chỉ thấy thông báo chung
                log.exception("Gemini error")
                text, tools = fallback.answer(prompt, adv)
                text = f"⚠️ Hệ thống AI đang bận, mình trả lời bằng chế độ cơ bản:\n\n{text}"
        st.markdown(text)
    st.session_state.messages.append({"role": "assistant", "content": text, "tools": tools})
    st.rerun()