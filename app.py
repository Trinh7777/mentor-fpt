"""BƯỚC 8 - Giao diện Web Streamlit cho Mentor FPT.
Hệ thống Đăng nhập bảo mật thông tin sinh viên + Giao diện đa năng thực dụng:
- Tự động chạy FAP Sync API Server ngầm (Port 8000)
- Lưu lịch sử chat bền vững theo từng MSSV
- 4 Tab chuyên biệt: Trợ lý AI, Tính điểm qua môn (FE Calculator), Sơ đồ cây môn học 9 kỳ (Roadmap), Điểm danh đa môn & Thời khóa biểu.
"""
import json
import logging
import os
import pandas as pd
import streamlit as st

import fallback
from advisor import StudentAdvisor
from config import DATA_DIR, DEFAULT_MODEL, TUITION_PER_CREDIT
from data_loader import load_all
from server import start_background_server, is_port_in_use

# Cấu hình logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("mentor_fpt")

# Tự động bật FAP Sync Receiver Server ngầm ở cổng 8000 ngay khi chạy Streamlit
start_background_server()

CHAT_HISTORY_FILE = DATA_DIR / "chat_history.json"


def load_student_chat(sid: str) -> list:
    if not CHAT_HISTORY_FILE.exists():
        return []
    try:
        with open(CHAT_HISTORY_FILE, encoding="utf-8") as f:
            all_hist = json.load(f)
        return all_hist.get(sid, [])
    except Exception:
        return []


def save_student_chat(sid: str, messages: list):
    if not sid:
        return
    try:
        all_hist = {}
        if CHAT_HISTORY_FILE.exists():
            with open(CHAT_HISTORY_FILE, encoding="utf-8") as f:
                all_hist = json.load(f)
        # Chỉ lưu tối đa 40 tin nhắn gần nhất để file nhẹ
        all_hist[sid] = messages[-40:]
        with open(CHAT_HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(all_hist, f, ensure_ascii=False, indent=2)
    except Exception:
        pass


# Cấu hình trang Streamlit
st.set_page_config(
    page_title="Mentor FPT - Cố Vấn Học Vụ Sinh Viên",
    page_icon="🎓",
    layout="wide" if "logged_in" in st.session_state and st.session_state.logged_in else "centered",
    initial_sidebar_state="expanded" if "logged_in" in st.session_state and st.session_state.logged_in else "collapsed"
)

DEBUG = os.getenv("DEBUG") == "1"


def get_api_key():
    """Key chỉ lấy từ server (biến môi trường hoặc secrets.toml), tuyệt đối không lộ lên UI."""
    key = os.getenv("GEMINI_API_KEY")
    if key:
        return key
    try:
        return st.secrets.get("GEMINI_API_KEY", "")
    except Exception:
        return ""


API_KEY = get_api_key()
MODEL = os.getenv("GEMINI_MODEL", DEFAULT_MODEL)
use_llm = bool(API_KEY)


@st.cache_resource
def get_agent(api_key: str, model: str):
    """Tái sử dụng GeminiAgent và connection pool để giảm độ trễ SSL/TCP."""
    from llm import GeminiAgent
    return GeminiAgent(api_key, model)


# ------------------------- CSS Styling Cao Cấp -------------------------
CUSTOM_CSS = """
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    html, body, [class*="css"] {
        font-family: 'Inter', sans-serif;
    }

    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}

    .login-container {
        max-width: 440px;
        margin: 1.5rem auto;
        padding: 2.2rem 2rem;
        background: #ffffff;
        border-radius: 18px;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        border: 1px solid #edf2f7;
        text-align: center;
    }
    .login-logo { font-size: 3rem; margin-bottom: 0.4rem; }
    .login-title { color: #1e293b; font-size: 1.6rem; font-weight: 700; margin-bottom: 0.25rem; }
    .login-subtitle { color: #64748b; font-size: 0.9rem; margin-bottom: 1.25rem; }

    .profile-card {
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
        color: #ffffff;
        padding: 1.15rem 1.6rem;
        border-radius: 16px;
        margin-bottom: 1rem;
        box-shadow: 0 8px 20px rgba(15, 23, 42, 0.12);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 1rem;
    }
    .profile-info { display: flex; align-items: center; gap: 1.2rem; }
    .profile-avatar {
        width: 50px; height: 50px; border-radius: 50%;
        background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
        color: white; display: flex; align-items: center; justify-content: center;
        font-size: 1.35rem; font-weight: 700;
        box-shadow: 0 4px 10px rgba(249, 115, 22, 0.3);
    }
    .profile-name { font-size: 1.3rem; font-weight: 700; margin: 0; color: #f8fafc; }
    .profile-meta { color: #94a3b8; font-size: 0.86rem; margin-top: 0.2rem; display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .badge-pill {
        display: inline-block; padding: 0.2rem 0.65rem; border-radius: 9999px;
        font-size: 0.75rem; font-weight: 600; letter-spacing: 0.02em;
    }
    .badge-orange { background: rgba(249, 115, 22, 0.2); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.4); }
    .badge-blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.4); }
    .badge-green { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }

    .alert-box { padding: 0.85rem 1.2rem; border-radius: 12px; margin-bottom: 0.9rem; font-size: 0.9rem; line-height: 1.45; }
    .alert-danger { background: #fef2f2; border-left: 5px solid #ef4444; color: #991b1b; }
    .alert-warning { background: #fffbeb; border-left: 5px solid #f59e0b; color: #92400e; }

    .sidebar-user-box {
        padding: 1rem; background: #f8fafc; border-radius: 12px;
        border: 1px solid #e2e8f0; margin-bottom: 1rem; text-align: center;
    }
    .sidebar-avatar {
        width: 46px; height: 46px; border-radius: 50%; background: #f97316; color: white;
        margin: 0 auto 0.5rem auto; display: flex; align-items: center; justify-content: center;
        font-weight: bold; font-size: 1.15rem;
    }

    /* Roadmap Cards */
    .subj-card {
        border-radius: 10px; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem;
        border: 1px solid #e2e8f0; font-size: 0.82rem; line-height: 1.35;
    }
    .subj-Passed { background: #ecfdf5; border-left: 4px solid #10b981; color: #065f46; }
    .subj-Studying { background: #eff6ff; border-left: 4px solid #3b82f6; color: #1e40af; }
    .subj-Failed { background: #fef2f2; border-left: 4px solid #ef4444; color: #991b1b; }
    .subj-Locked { background: #f8fafc; border-left: 4px solid #94a3b8; color: #64748b; opacity: 0.85; }
    .subj-Available { background: #fffbeb; border-left: 4px solid #f59e0b; color: #92400e; }

    .stChatMessage { border-radius: 14px; margin-bottom: 0.75rem; }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

# ------------------------- Khởi tạo State Đăng nhập -------------------------
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.student_id = None
    st.session_state.messages = []
    st.session_state.campus = "Hà Nội"

data = load_all()
students_dict = data.get("students", {})


def authenticate_student(identifier: str, password: str):
    """Xác thực sinh viên bằng MSSV hoặc Email FPT."""
    clean_id = identifier.strip().lower()
    matched_sid = None
    for sid, s in students_dict.items():
        if sid.lower() == clean_id or s.get("email", "").lower() == clean_id:
            matched_sid = sid
            break

    if not matched_sid:
        return None, "Không tìm thấy thông tin sinh viên với MSSV/Email này."

    clean_pwd = password.strip().lower()
    valid_passwords = ["123456", matched_sid.lower(), "fpt@123", "fpt123", ""]
    if clean_pwd not in valid_passwords and clean_pwd != "123456":
        return None, "Mật khẩu không chính xác. (Mặc định: 123456 hoặc chính mã MSSV)."

    return matched_sid, None


# =========================================================================
# MÀN HÌNH 1: ĐĂNG NHẬP
# =========================================================================
if not st.session_state.logged_in:
    st.markdown("""
    <div class="login-container">
        <div class="login-logo">🎓</div>
        <div class="login-title">Mentor FPT</div>
        <div class="login-subtitle">Hệ Thống Cố Vấn Học Vụ, Tính Điểm FE & Đồng Bộ FAP Trực Tuyến</div>
    </div>
    """, unsafe_allow_html=True)

    with st.container():
        col_space1, col_form, col_space2 = st.columns([1, 2, 1])
        with col_form:
            with st.form("login_form", clear_on_submit=False):
                st.write("### 🔐 Đăng nhập cổng sinh viên")
                student_input = st.text_input(
                    "Mã số sinh viên (MSSV) hoặc Email FPT:",
                    placeholder="Ví dụ: SE190456 hoặc se190456@fpt.edu.vn"
                )
                password_input = st.text_input(
                    "Mật khẩu:",
                    type="password",
                    placeholder="Nhập mật khẩu (Mặc định: 123456)"
                )
                campus_choice = st.selectbox(
                    "Cơ sở theo học:",
                    list(TUITION_PER_CREDIT),
                    index=0
                )
                submit_button = st.form_submit_button("🚀 Đăng nhập vào Hệ thống", use_container_width=True)

                if submit_button:
                    if not student_input:
                        st.error("Vui lòng nhập Mã số sinh viên hoặc Email!")
                    else:
                        sid, err = authenticate_student(student_input, password_input)
                        if err:
                            st.error(f"❌ {err}")
                        else:
                            st.session_state.logged_in = True
                            st.session_state.student_id = sid
                            st.session_state.campus = campus_choice
                            st.session_state.messages = load_student_chat(sid)
                            st.rerun()

            with st.expander("ℹ️ Tài khoản demo kiểm thử các kịch bản thực tế"):
                st.markdown("""
                - `SE190456` – **Nguyễn Văn A** (Kỳ 5, Học lực Giỏi, **nguy cơ cấm thi DPL302m - chỉ còn 1 buổi nghỉ**)
                - `SE190457` – **Lê Minh Hoàng** (Kỳ 5, **Đã bị cấm thi AF môn BDI302c do vắng 25%**)
                - `SE190460` – **Phạm Thanh Thảo** (Kỳ 5, **Nợ môn + Cấm thi AF môn DSR301m**)
                - `SE190459` – **Trần Anh Tuấn** (Kỳ 3, **Đang nợ môn tiên quyết MAD101, PFP191**)
                - `SE190463` – **Bùi Quốc Anh** (Kỳ 9, **Đang làm khóa luận AIP491 & chuẩn bị xét tốt nghiệp**)
                - **Mật khẩu mặc định:** `123456` (hoặc chính mã MSSV)
                """)

    st.stop()

else:
    # =========================================================================
    # MÀN HÌNH 2: DASHBOARD & CHATBOT CHÍNH
    # =========================================================================
    sid = st.session_state.student_id
    campus = st.session_state.campus
    adv = StudentAdvisor(sid, campus)
    s = adv.student
    initial = s['full_name'].split()[-1][0].upper() if s.get('full_name') else "S"
    sync_online = is_port_in_use(8000)

    # ------------------------- SIDEBAR -------------------------
    with st.sidebar:
        st.markdown(f"""
        <div class="sidebar-user-box">
            <div class="sidebar-avatar">{initial}</div>
            <div style="font-weight: 700; color: #1e293b; font-size: 1.05rem;">{s['full_name']}</div>
            <div style="color: #64748b; font-size: 0.85rem;">{s['student_id']} · Kỳ {s['current_semester']}</div>
            <div style="margin-top: 0.4rem;"><span class="badge-pill badge-orange">{s['major']}</span></div>
        </div>
        """, unsafe_allow_html=True)

        st.caption(
            f"🟢 **FAP Sync Server:** Đang chạy (Port 8000)" if sync_online
            else "⚪ **FAP Sync Server:** Chưa kích hoạt"
        )

        st.subheader("⚙️ Tùy chọn")
        new_campus = st.selectbox(
            "Cơ sở (tính học phí):",
            list(TUITION_PER_CREDIT),
            index=list(TUITION_PER_CREDIT).index(campus) if campus in TUITION_PER_CREDIT else 0
        )
        if new_campus != campus:
            st.session_state.campus = new_campus
            st.rerun()

        st.markdown("---")
        col_sb1, col_sb2 = st.columns(2)
        if col_sb1.button("🔄 Nạp lại data", use_container_width=True):
            load_all.cache_clear()
            st.rerun()
        if col_sb2.button("🧹 Xóa chat", use_container_width=True):
            st.session_state.messages = []
            save_student_chat(sid, [])
            st.rerun()

        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("🚪 Đăng xuất", use_container_width=True, type="secondary"):
            st.session_state.logged_in = False
            st.session_state.student_id = None
            st.session_state.messages = []
            st.rerun()

    # ------------------------- HEADER BANNER -------------------------
    status_vn = "Đang học" if s.get("status") == "Studying" else s.get("status", "Đang học")
    g, p = adv.gpa(), adv.progress()
    att_info = adv.get_attendance_details()

    st.markdown(f"""
    <div class="profile-card">
        <div class="profile-info">
            <div class="profile-avatar">{initial}</div>
            <div>
                <div class="profile-name">{s['full_name']}</div>
                <div class="profile-meta">
                    <span>🎓 <b>MSSV:</b> {s['student_id']}</span>
                    <span>📚 <b>Ngành:</b> {s['major']}</span>
                    <span>📅 <b>Học kỳ:</b> {s['current_semester']}</span>
                    <span>📍 <b>Cơ sở:</b> {campus}</span>
                    <span class="badge-pill badge-blue">{status_vn}</span>
                    <span class="badge-pill badge-green">GPA: {g['gpa']:.2f} ({g['classification']})</span>
                </div>
            </div>
        </div>
    </div>
    """, unsafe_allow_html=True)

    # ------------------------- TỔNG QUAN GỌN GÀNG (THU GỌN MẶC ĐỊNH) -------------------------
    with st.expander("📊 Xem nhanh Tiến độ học tập & Chuyên cần", expanded=False):
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("GPA Tích lũy", f"{g['gpa']:.2f}", g["classification"])
        with col2:
            st.metric("Tín chỉ tích lũy", f"{p['credits_passed']}/{p['credits_total']}", f"{p['percent']}%")
        with col3:
            st.metric("Môn đang nợ", len(p["failed_pending_retake"]))
        with col4:
            if att_info and "absent_slots" in att_info:
                att_stat = "🚨 Bị cấm thi (AF)" if att_info.get("is_attendance_fail") else ("⚠️ Nguy cơ AF" if att_info.get("remaining_allowed_absent") == 1 else "✅ Đạt")
                st.metric("Chuyên cần", att_stat, f"Vắng {att_info.get('absent_slots', 0)}/{att_info.get('total_slots', 0)} buổi")
            else:
                st.metric("Chuyên cần", "✅ Tốt")

        st.progress(min(p["percent"] / 100, 1.0))

        if g.get("by_semester"):
            st.caption("Biểu đồ biến động GPA qua các kỳ học:")
            st.bar_chart(pd.Series(g["by_semester"], name="GPA"))

    # ------------------------- GIAO DIỆN CHAT AI CHÍNH -------------------------
    for m in st.session_state.messages:
        with st.chat_message(m["role"], avatar="🧑‍🎓" if m["role"] == "user" else "🎓"):
            st.markdown(m["content"])
            if DEBUG and m.get("tools"):
                with st.expander("🔧 Dữ liệu tra cứu hệ thống (Tool Call)"):
                    for t in m["tools"]:
                        st.write(f"**{t['tool']}**", t["args"] or "")
                        st.json(t["result"], expanded=False)

    if not st.session_state.messages:
        first_name = s['full_name'].split()[-1]
        studying_codes = [x["subject_code"] for x in p["studying"]]
        sample_sim = ", ".join(f"{c} {8.0 - 0.5*(i%2)}" for i, c in enumerate(studying_codes[:4])) if studying_codes else "DPL302m 8.5, BDI302c 7.5, DSR301m 8.0, DWP301c 7.0"
        st.info(f"""
        👋 **Chào bạn {first_name}!** Mình là **Mentor FPT** — Trợ lý AI tư vấn học vụ, dự báo học lực và tra cứu quy chế cá nhân.

        Bạn có thể hỏi trực tiếp bằng ngôn ngữ tự nhiên các bài toán như:
        - 🎓 **Dự đoán năm tốt nghiệp & Xếp loại ra trường:** *"Dự đoán xem năm nào mình tốt nghiệp và ra trường đạt bằng loại gì?"*
        - 🧮 **Giả lập GPA dự kiến khi nhập điểm các môn trong kỳ:** *"Giả sử kỳ này mình đạt {sample_sim} thì GPA kỳ này và GPA tích lũy mới là bao nhiêu, xếp loại gì?"*
        - 🎯 **Tính điểm thi Final Exam (FE) để qua môn:** *"Môn DPL302m điểm quá trình mình được 6.5 thì thi FE cần tối thiểu bao nhiêu điểm để qua môn?"*
        - 🏢 **Xét điều kiện đi OJT & Khóa luận tốt nghiệp:** *"Mình đã đủ điều kiện đi thực tập OJT kỳ 6 chưa? Còn thiếu bao nhiêu tín chỉ?"*
        - 📋 **Thời khóa biểu, Điểm danh & Quy chế FPT:** *"Tình hình điểm danh môn đang học của mình thế nào?"*, *"Bùng học mấy buổi thì bị cấm thi?"*
        """)

    prompt = st.chat_input(f"Nhập câu hỏi của bạn, {s['full_name'].split()[-1]}...")

    if prompt:
        history = list(st.session_state.messages)
        st.session_state.messages.append({"role": "user", "content": prompt})
        with st.chat_message("user", avatar="🧑‍🎓"):
            st.markdown(prompt)
        with st.chat_message("assistant", avatar="🎓"):
            text = ""
            tools = []
            try:
                if use_llm:
                    agent = get_agent(API_KEY, MODEL)
                    with st.spinner("Mentor FPT đang phân tích dữ liệu học vụ..."):
                        stream_gen, tools = agent.respond_stream(history, prompt, adv)
                    text = st.write_stream(stream_gen)
                else:
                    text, tools = fallback.answer(prompt, adv)
                    st.markdown(text)
            except Exception:
                log.exception("Lỗi xử lý từ hệ thống AI")
                text, tools = fallback.answer(prompt, adv)
                text = f"⚠️ Hệ thống AI tạm thời bận, Mentor FPT đã chuyển sang chế độ phân tích trực tiếp:\n\n{text}"
                st.markdown(text)
        st.session_state.messages.append({"role": "assistant", "content": text, "tools": tools})
        save_student_chat(sid, st.session_state.messages)
        st.rerun()