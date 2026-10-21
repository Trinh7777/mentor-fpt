"""BƯỚC 8 - Giao diện Web Streamlit chuẩn thiết kế UniFs (FPT University AI Assistant).
- Hỗ trợ chuyển đổi Sáng / Tối (Light / Dark Mode) giống hệt mockup UniFs
- Mascot Robot 3D UniFs + Logo 3 màu đặc trưng FPT (Xanh dương - Cam - Xanh lá)
- 4 Thẻ chủ đề gợi ý thông minh: Hỏi về học tập, Tra cứu thông tin, Hỗ trợ nghiên cứu, Khác
- Tích hợp SQL Database (SQLite/PostgreSQL), Đổi mật khẩu SHA-256, Silent FAP Auto-Sync & Telegram Bot.
"""
import base64
import logging
import os
from pathlib import Path
import pandas as pd
import streamlit as st

import fallback
from advisor import StudentAdvisor
from config import DEFAULT_MODEL, TUITION_PER_CREDIT
from data_loader import load_all
from database import (
    verify_student_credentials,
    change_student_password,
    load_chat_history_db,
    save_chat_history_db,
    _is_postgres,
)
from server import start_background_server, is_port_in_use
from telegram_bot import start_telegram_bot_if_configured, get_telegram_token

# Cấu hình logging
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("unifs_fpt")

# Tự động bật FAP Sync Receiver Server ngầm ở cổng 8000
start_background_server()

ASSETS_DIR = Path(__file__).parent / "assets"
HERO_MASCOT_PATH = ASSETS_DIR / "mascot_hero.jpg"
AVATAR_MASCOT_PATH = ASSETS_DIR / "mascot_avatar.jpg"


@st.cache_data
def get_img_b64(path: Path) -> str:
    if path.exists():
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("utf-8")
    return ""


HERO_B64 = get_img_b64(HERO_MASCOT_PATH)
AVATAR_B64 = get_img_b64(AVATAR_MASCOT_PATH)


def load_student_chat(sid: str) -> list:
    return load_chat_history_db(sid)


def save_student_chat(sid: str, messages: list):
    save_chat_history_db(sid, messages)


# Khởi tạo State
if "logged_in" not in st.session_state:
    st.session_state.logged_in = False
    st.session_state.student_id = None
    st.session_state.messages = []
    st.session_state.campus = "Hà Nội"
if "dark_mode" not in st.session_state:
    st.session_state.dark_mode = False
if "active_category" not in st.session_state:
    st.session_state.active_category = None

# Cấu hình trang Streamlit
st.set_page_config(
    page_title="UniFs - Trợ lý AI của sinh viên FPT University",
    page_icon=str(AVATAR_MASCOT_PATH) if AVATAR_MASCOT_PATH.exists() else "🤖",
    layout="wide" if st.session_state.logged_in else "centered",
    initial_sidebar_state="expanded" if st.session_state.logged_in else "collapsed"
)

DEBUG = os.getenv("DEBUG") == "1"


def get_api_key():
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

start_telegram_bot_if_configured(API_KEY)


@st.cache_resource
def get_agent(api_key: str, model: str):
    from llm import GeminiAgent
    return GeminiAgent(api_key, model)


# ------------------------- CSS THEO ĐÚNG MOCKUP UNIFS (LIGHT & DARK MODE) -------------------------
dark = st.session_state.dark_mode

bg_main = "#0b132b" if dark else "#ffffff"
bg_sidebar = "#111a30" if dark else "#f4f7fb"
text_primary = "#f8fafc" if dark else "#1e293b"
text_secondary = "#94a3b8" if dark else "#64748b"
card_bg = "#16223f" if dark else "#ffffff"
card_border = "#253659" if dark else "#e6edf5"
card_hover = "#1e2e52" if dark else "#f8fbff"
topbar_border = "#1e2d4d" if dark else "#edf2f7"
unifs_u_color = "#ffffff" if dark else "#0056d2"

CUSTOM_CSS = f"""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    html, body, [class*="css"] {{
        font-family: 'Inter', sans-serif;
    }}

    /* Ẩn header/footer mặc định của Streamlit để dùng Topbar FPT University */
    #MainMenu {{visibility: hidden;}}
    footer {{visibility: hidden;}}
    header {{visibility: hidden; height: 0px !important;}}

    .stApp {{
        background-color: {bg_main};
        color: {text_primary};
    }}

    .block-container {{
        padding-top: 1.2rem !important;
        padding-bottom: 2rem !important;
        max-width: 960px !important;
    }}

    /* Sidebar chuẩn UniFs */
    [data-testid="stSidebar"] {{
        background-color: {bg_sidebar} !important;
        border-right: 1px solid {topbar_border};
    }}
    [data-testid="stSidebar"] * {{
        color: {text_primary};
    }}

    /* Top Header Bar (FPT University) */
    .unifs-topbar {{
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0.65rem 1.25rem;
        margin-bottom: 1rem;
        border-bottom: 1px solid {topbar_border};
        background: {bg_main};
    }}
    .fpt-brand {{
        display: flex;
        align-items: center;
        gap: 0.65rem;
        font-weight: 700;
        font-size: 1.05rem;
        color: {text_primary};
    }}
    .fpt-boxes {{
        display: inline-flex;
        gap: 3px;
        align-items: center;
    }}
    .fpt-box {{
        padding: 2px 7px;
        border-radius: 4px;
        color: #ffffff !important;
        font-weight: 800;
        font-size: 0.82rem;
        letter-spacing: 0.5px;
        transform: skewX(-10deg);
    }}
    .fpt-blue {{ background: #0066b2; }}
    .fpt-orange {{ background: #f37021; }}
    .fpt-green {{ background: #0db14b; }}

    /* Logo chữ UniFs✨ */
    .unifs-wordmark {{
        font-size: 2.5rem;
        font-weight: 800;
        letter-spacing: -0.02em;
        line-height: 1.1;
        margin: 0.25rem 0;
    }}
    .unifs-wordmark .u-blue {{ color: {unifs_u_color}; }}
    .unifs-wordmark .u-orange {{ color: #f37021; }}
    .unifs-wordmark .u-green {{ color: #0db14b; }}
    .unifs-wordmark .u-star {{
        color: {unifs_u_color};
        font-size: 1.6rem;
        vertical-align: super;
        margin-left: 2px;
    }}

    /* Sidebar Brand */
    .sb-brand-wrap {{
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.3rem 0.2rem 0.6rem 0.2rem;
    }}
    .sb-avatar-circle {{
        width: 50px;
        height: 50px;
        border-radius: 50%;
        overflow: hidden;
        border: 2px solid #0066b2;
        background: #ffffff;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
    }}
    .sb-avatar-circle img {{
        width: 100%;
        height: 100%;
        object-fit: cover;
    }}
    .sb-wordmark {{
        font-size: 1.65rem;
        font-weight: 800;
        line-height: 1.05;
    }}
    .sb-sub {{
        font-size: 0.78rem;
        color: {text_secondary} !important;
        margin-bottom: 1rem;
        line-height: 1.35;
    }}

    /* Center Hero Section */
    .hero-wrapper {{
        text-align: center;
        margin: 0.5rem auto 1.4rem auto;
        max-width: 620px;
    }}
    .hero-mascot-img {{
        width: 155px;
        height: 155px;
        object-fit: contain;
        border-radius: 50%;
        background: #ffffff;
        padding: 6px;
        box-shadow: 0 10px 28px rgba(0, 102, 178, 0.18);
        margin-bottom: 0.35rem;
    }}
    .hero-subtitle {{
        font-size: 1.15rem;
        font-weight: 700;
        color: {text_primary};
        margin-bottom: 0.45rem;
    }}
    .hero-greeting {{
        font-size: 0.92rem;
        color: {text_secondary};
        line-height: 1.5;
    }}

    /* 4 Category Cards */
    .cat-card {{
        background: {card_bg};
        border: 1px solid {card_border};
        border-radius: 14px;
        padding: 0.9rem 1.1rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 0.5rem;
        transition: all 0.2s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.03);
    }}
    .cat-card:hover {{
        background: {card_hover};
        border-color: #0066b2;
    }}
    .cat-left {{
        display: flex;
        align-items: center;
        gap: 0.85rem;
    }}
    .cat-icon {{
        width: 40px;
        height: 40px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        flex-shrink: 0;
    }}
    .icon-blue {{ background: rgba(0, 102, 178, 0.14); color: #0066b2; }}
    .icon-orange {{ background: rgba(243, 112, 33, 0.14); color: #f37021; }}
    .icon-green {{ background: rgba(13, 177, 75, 0.14); color: #0db14b; }}
    .cat-title {{
        font-weight: 700;
        font-size: 0.95rem;
        color: {text_primary};
        margin: 0;
    }}
    .cat-desc {{
        font-size: 0.78rem;
        color: {text_secondary};
        margin: 0.12rem 0 0 0;
    }}

    /* Footer ready status */
    .unifs-ready-footer {{
        text-align: center;
        font-size: 0.8rem;
        color: {text_secondary};
        margin-top: 0.6rem;
    }}
    .green-dot {{
        display: inline-block;
        width: 8px;
        height: 8px;
        background-color: #10b981;
        border-radius: 50%;
        margin-right: 5px;
    }}

    /* Sidebar Footer */
    .sb-footer {{
        margin-top: 2rem;
        padding-top: 0.8rem;
        border-top: 1px solid {topbar_border};
        font-size: 0.8rem;
        color: {text_secondary} !important;
    }}
    .fpt-stripes {{
        display: inline-flex;
        gap: 4px;
        margin-bottom: 6px;
    }}
    .stripe {{
        width: 8px;
        height: 18px;
        border-radius: 2px;
        transform: skewX(-18deg);
    }}

    /* Login Card */
    .login-card {{
        max-width: 430px;
        margin: 1rem auto;
        padding: 2rem 1.8rem;
        background: {card_bg};
        border: 1px solid {card_border};
        border-radius: 20px;
        box-shadow: 0 12px 32px rgba(0, 0, 0, 0.08);
        text-align: center;
    }}
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

data = load_all()


def authenticate_student(identifier: str, password: str):
    return verify_student_credentials(identifier, password)


# =========================================================================
# MÀN HÌNH 1: ĐĂNG NHẬP CHUẨN GIAO DIỆN UNIFS
# =========================================================================
if not st.session_state.logged_in:
    hero_img_html = f'<img src="data:image/jpeg;base64,{HERO_B64}" class="hero-mascot-img" alt="UniFs">' if HERO_B64 else '<div style="font-size:4rem;">🤖</div>'
    st.markdown(f"""
    <div class="login-card">
        <div class="fpt-brand" style="justify-content:center; margin-bottom:0.8rem;">
            <span class="fpt-boxes">
                <span class="fpt-box fpt-blue">F</span>
                <span class="fpt-box fpt-orange">P</span>
                <span class="fpt-box fpt-green">T</span>
            </span>
            <span>FPT University</span>
        </div>
        {hero_img_html}
        <div class="unifs-wordmark">
            <span class="u-blue">Uni</span><span class="u-orange">F</span><span class="u-green">s</span><span class="u-star">✦</span>
        </div>
        <div class="hero-subtitle" style="font-size:1rem; margin-bottom:0.2rem;">Trợ lý AI của sinh viên FPT University</div>
        <div class="hero-greeting" style="font-size:0.84rem;">Đăng nhập bằng MSSV hoặc Email FPT để cá nhân hóa lộ trình học tập</div>
    </div>
    """, unsafe_allow_html=True)

    col_s1, col_form, col_s2 = st.columns([1, 2.2, 1])
    with col_form:
        with st.form("login_form", clear_on_submit=False):
            student_input = st.text_input(
                "Mã số sinh viên (MSSV) hoặc Email FPT:",
                placeholder="Ví dụ: SE190456 hoặc se190456@fpt.edu.vn"
            )
            password_input = st.text_input(
                "Mật khẩu:",
                type="password",
                placeholder="Nhập mật khẩu (Mặc định: 123456)"
            )
            campus_choice = st.selectbox("Cơ sở theo học:", list(TUITION_PER_CREDIT), index=0)
            submit_button = st.form_submit_button("🚀 Bắt đầu trò chuyện với UniFs", use_container_width=True, type="primary")

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
                        st.session_state.active_category = None
                        st.rerun()

        with st.expander("ℹ️ Tài khoản sinh viên mẫu để kiểm thử"):
            st.markdown("""
            - `SE190456` – **Nguyễn Văn A** (Kỳ 5, Học lực Giỏi, **nguy cơ cấm thi DPL302m**)
            - `SE190457` – **Lê Minh Hoàng** (Kỳ 5, **Đã bị cấm thi AF môn BDI302c**)
            - `SE190460` – **Phạm Thanh Thảo** (Kỳ 5, **Đang nợ môn + Cấm thi AF**)
            - `SE190459` – **Trần Anh Tuấn** (Kỳ 3, **Đang nợ môn tiên quyết MAD101, PFP191**)
            - `SE190463` – **Bùi Quốc Anh** (Kỳ 9, **Đang làm khóa luận AIP491 & xét tốt nghiệp**)
            - **Mật khẩu mặc định:** `123456`
            """)

    st.stop()

# =========================================================================
# MÀN HÌNH 2: GIAO DIỆN CHÍNH UNIFS (GIỐNG HỆT MOCKUP)
# =========================================================================
sid = st.session_state.student_id
campus = st.session_state.campus
adv = StudentAdvisor(sid, campus)
s = adv.student
g, p = adv.gpa(), adv.progress()
gpa_val = g.get("gpa")
gpa_str = f"{gpa_val:.2f} ({g.get('classification')})" if gpa_val is not None else "Chưa đồng bộ điểm"
sync_online = is_port_in_use(8000)

# ------------------------- SIDEBAR TRÁI CHUẨN UNIFS -------------------------
with st.sidebar:
    avatar_sidebar_html = f'<img src="data:image/jpeg;base64,{AVATAR_B64}" alt="UniFs">' if AVATAR_B64 else '🤖'
    st.markdown(f"""
    <div class="sb-brand-wrap">
        <div class="sb-avatar-circle">{avatar_sidebar_html}</div>
        <div>
            <div class="sb-wordmark">
                <span style="color:{unifs_u_color};">Uni</span><span style="color:#f37021;">F</span><span style="color:#0db14b;">s</span><span style="color:{unifs_u_color}; font-size:1.1rem; vertical-align:super;">✦</span>
            </div>
        </div>
    </div>
    <div class="sb-sub">Trợ lý AI của sinh viên<br>FPT University</div>
    """, unsafe_allow_html=True)

    # Nút New chat nổi bật giống hệt thiết kế
    if st.button("💬  New chat", use_container_width=True, type="primary"):
        st.session_state.messages = []
        st.session_state.active_category = None
        save_student_chat(sid, [])
        st.rerun()

    # Mục Chat history
    with st.expander("🕒  Chat history", expanded=False):
        user_msgs = [m["content"] for m in st.session_state.messages if m.get("role") == "user"]
        if user_msgs:
            for idx, um in enumerate(reversed(user_msgs[-6:])):
                short_txt = um[:34] + "..." if len(um) > 34 else um
                st.caption(f"• {short_txt}")
        else:
            st.caption("Chưa có lịch sử câu hỏi trong phiên này.")

    # Hồ sơ tóm tắt & cài đặt cá nhân
    with st.expander(f"👤  {s['full_name']} ({sid})", expanded=False):
        st.caption(f"📚 **Ngành:** {s['major']}")
        st.caption(f"📅 **Học kỳ:** {s['current_semester']} · **GPA:** {gpa_str}")
        st.caption(f"🎓 **Tín chỉ:** {p['credits_passed']}/{p['credits_total']} ({p['percent']}%)")
        st.caption(f"🟢 **FAP Auto-Sync:** {'Đang bật' if sync_online else 'Tắt'}")

        new_campus = st.selectbox(
            "Cơ sở đào tạo:",
            list(TUITION_PER_CREDIT),
            index=list(TUITION_PER_CREDIT).index(campus) if campus in TUITION_PER_CREDIT else 0
        )
        if new_campus != campus:
            st.session_state.campus = new_campus
            st.rerun()

        if st.button("🔄 Đồng bộ lại Database", use_container_width=True):
            load_all.cache_clear()
            st.rerun()

    with st.expander("🔐  Đổi mật khẩu", expanded=False):
        with st.form("change_pwd_form", clear_on_submit=True):
            old_p = st.text_input("Mật khẩu cũ:", type="password")
            new_p = st.text_input("Mật khẩu mới:", type="password")
            conf_p = st.text_input("Xác nhận:", type="password")
            if st.form_submit_button("Lưu mật khẩu", use_container_width=True):
                if not old_p or not new_p:
                    st.error("Nhập đủ thông tin!")
                elif new_p != conf_p:
                    st.error("Mật khẩu không khớp!")
                else:
                    ok, msg = change_student_password(sid, old_p, new_p)
                    if ok:
                        load_all.cache_clear()
                        st.success(msg)
                    else:
                        st.error(msg)

    if st.button("🚪  Đăng xuất", use_container_width=True):
        st.session_state.logged_in = False
        st.session_state.student_id = None
        st.session_state.messages = []
        st.rerun()

    # Footer 3 sọc màu FPT University - Kiến tạo tương lai
    st.markdown("""
    <div class="sb-footer">
        <div class="fpt-stripes">
            <span class="stripe fpt-blue"></span>
            <span class="stripe fpt-orange"></span>
            <span class="stripe fpt-green"></span>
        </div>
        <div style="font-weight:600;">FPT University</div>
        <div style="opacity:0.85;">Kiến tạo tương lai</div>
    </div>
    """, unsafe_allow_html=True)

# ------------------------- THANH TOP HEADER BAR -------------------------
top_col1, top_col2, top_col3 = st.columns([6, 0.8, 1.8])
with top_col1:
    st.markdown("""
    <div class="fpt-brand" style="padding-top:0.25rem;">
        <span class="fpt-boxes">
            <span class="fpt-box fpt-blue">F</span>
            <span class="fpt-box fpt-orange">P</span>
            <span class="fpt-box fpt-green">T</span>
        </span>
        <span>FPT University</span>
    </div>
    """, unsafe_allow_html=True)

with top_col2:
    theme_icon = "🌙" if dark else "☀️"
    if st.button(theme_icon, help="Chuyển chế độ Sáng / Tối (Light / Dark mode)", use_container_width=True):
        st.session_state.dark_mode = not st.session_state.dark_mode
        st.rerun()

with top_col3:
    st.markdown(f"""
    <div style="display:flex; align-items:center; justify-content:flex-end; gap:0.5rem; padding-top:0.2rem;">
        <span style="font-size:0.83rem; font-weight:600; color:{text_secondary};">{sid}</span>
        <div style="width:32px; height:32px; border-radius:50%; background:#64748b; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">
            👤
        </div>
    </div>
    """, unsafe_allow_html=True)

st.markdown(f"<hr style='margin:0.4rem 0 1.2rem 0; border-color:{topbar_border}; opacity:0.5;'>", unsafe_allow_html=True)

# ------------------------- MÀN HÌNH CHÀO MỪNG HERO UNIFS (KHI CHƯA CÓ TIN NHẮN) -------------------------
triggered_prompt = None
studying_codes = [x["subject_code"] for x in p["studying"]]
sample_sim = ", ".join(f"{c} {8.0 - 0.5*(i%2)}" for i, c in enumerate(studying_codes[:4])) if studying_codes else "DPL302m 8.5, BDI302c 7.5, DSR301m 8.0, DWP301c 7.0"

CATEGORY_PROMPTS = {
    "study": {
        "title": "🎓 Gợi ý câu hỏi về Học tập & Dự báo AI:",
        "items": [
            f"Giả sử kỳ này mình đạt {sample_sim} thì GPA kỳ này và GPA tích lũy dự kiến là bao nhiêu?",
            "Dự đoán xem năm nào mình tốt nghiệp và khi ra trường mình đạt bằng loại gì?",
            "Môn DPL302m điểm quá trình mình được 6.5 thì thi Final Exam cần mấy điểm để qua môn?",
            "Thời khóa biểu tuần này và tình hình điểm danh của mình thế nào?",
        ]
    },
    "info": {
        "title": "📄 Gợi ý Tra cứu quy chế, biểu mẫu & thủ tục FAP:",
        "items": [
            "Làm thế nào để xin giấy tạm hoãn nghĩa vụ quân sự (NVQS) trên FAP?",
            "Mình đang nợ môn nào và học phí học lại hết bao nhiêu tiền?",
            "Mình đã đủ điều kiện đi thực tập doanh nghiệp OJT kỳ 6 chưa?",
            "Quy định về cấm thi chuyên cần (vắng quá 20%) và kỷ luật phòng thi?",
        ]
    },
    "research": {
        "title": "📗 Gợi ý Hỗ trợ nghiên cứu & Khóa luận tốt nghiệp:",
        "items": [
            "Điều kiện và quy trình bảo vệ Khóa luận tốt nghiệp (Hội đồng 1.1 và 1.2) tại FPTU?",
            "Mức thưởng công bố bài báo khoa học ISI/Scopus (Q1, Q2, Q3, Q4) của trường là bao nhiêu?",
            "Kỳ tới mình nên đăng ký những môn chuyên ngành nào để không bị chặn tiên quyết?",
        ]
    },
    "other": {
        "title": "🔗 Câu hỏi chung & Đời sống sinh viên:",
        "items": [
            "Mượn sách thư viện trả trễ 10 ngày thì bị phạt bao nhiêu tiền?",
            "Thủ tục xin bảo lưu học kỳ hoặc chuyển cơ sở đào tạo trên FAP?",
            "Để đạt bằng Giỏi (GPA 8.0) khi ra trường thì các kỳ còn lại mình cần trung bình mấy điểm?",
        ]
    }
}

if not st.session_state.messages:
    hero_img_tag = f'<img src="data:image/jpeg;base64,{HERO_B64}" class="hero-mascot-img" alt="UniFs Mascot">' if HERO_B64 else '<div style="font-size:4.5rem;">🤖</div>'
    st.markdown(f"""
    <div class="hero-wrapper">
        {hero_img_tag}
        <div class="unifs-wordmark">
            <span class="u-blue">Uni</span><span class="u-orange">F</span><span class="u-green">s</span><span class="u-star">✦</span>
        </div>
        <div class="hero-subtitle">Trợ lý AI của sinh viên FPT University</div>
        <div class="hero-greeting">
            Xin chào <b>{s['full_name']}</b>! Mình là <b>UniFs</b> 👋<br>
            Mình sẵn sàng hỗ trợ bạn tìm kiếm thông tin,<br>
            giải đáp thắc mắc và đồng hành trong hành trình học tập<br>
            tại FPT University!
        </div>
    </div>
    """, unsafe_allow_html=True)

    # 4 Thẻ Category 2x2 chuẩn theo thiết kế UniFs
    row1_c1, row1_c2 = st.columns(2)
    with row1_c1:
        st.markdown("""
        <div class="cat-card">
            <div class="cat-left">
                <div class="cat-icon icon-blue">🎓</div>
                <div>
                    <div class="cat-title">Hỏi về học tập</div>
                    <div class="cat-desc">Lịch học, môn học, điểm số, dự báo GPA...</div>
                </div>
            </div>
            <div style="color:#94a3b8; font-weight:700;">›</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Chọn: Hỏi về học tập", key="btn_cat_study", use_container_width=True):
            st.session_state.active_category = "study"

    with row1_c2:
        st.markdown("""
        <div class="cat-card">
            <div class="cat-left">
                <div class="cat-icon icon-orange">📄</div>
                <div>
                    <div class="cat-title">Tra cứu thông tin</div>
                    <div class="cat-desc">Quy định, biểu mẫu, thủ tục FAP...</div>
                </div>
            </div>
            <div style="color:#94a3b8; font-weight:700;">›</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Chọn: Tra cứu thông tin", key="btn_cat_info", use_container_width=True):
            st.session_state.active_category = "info"

    row2_c1, row2_c2 = st.columns(2)
    with row2_c1:
        st.markdown("""
        <div class="cat-card">
            <div class="cat-left">
                <div class="cat-icon icon-green">📖</div>
                <div>
                    <div class="cat-title">Hỗ trợ nghiên cứu</div>
                    <div class="cat-desc">Đồ án KLTN, khen thưởng NCKH, lộ trình...</div>
                </div>
            </div>
            <div style="color:#94a3b8; font-weight:700;">›</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Chọn: Hỗ trợ nghiên cứu", key="btn_cat_research", use_container_width=True):
            st.session_state.active_category = "research"

    with row2_c2:
        st.markdown("""
        <div class="cat-card">
            <div class="cat-left">
                <div class="cat-icon icon-blue">🔗</div>
                <div>
                    <div class="cat-title">Khác</div>
                    <div class="cat-desc">Câu hỏi chung, thư viện, đời sống...</div>
                </div>
            </div>
            <div style="color:#94a3b8; font-weight:700;">›</div>
        </div>
        """, unsafe_allow_html=True)
        if st.button("Chọn: Khác", key="btn_cat_other", use_container_width=True):
            st.session_state.active_category = "other"

    # Hiển thị các câu hỏi gợi ý khi bấm vào 1 trong 4 thẻ
    active_cat = st.session_state.active_category
    if active_cat and active_cat in CATEGORY_PROMPTS:
        cat_obj = CATEGORY_PROMPTS[active_cat]
        st.markdown(f"**{cat_obj['title']}**")
        for i, q_text in enumerate(cat_obj["items"]):
            if st.button(f"✨ {q_text}", key=f"subq_{active_cat}_{i}", use_container_width=True):
                triggered_prompt = q_text

# ------------------------- HIỂN THỊ TIN NHẮN HỘI THOẠI -------------------------
bot_avatar = str(AVATAR_MASCOT_PATH) if AVATAR_MASCOT_PATH.exists() else "🤖"

for m in st.session_state.messages:
    with st.chat_message(m["role"], avatar="🧑‍🎓" if m["role"] == "user" else bot_avatar):
        st.markdown(m["content"])
        if DEBUG and m.get("tools"):
            with st.expander("🔧 Dữ liệu tra cứu hệ thống (Tool Call)"):
                for t in m["tools"]:
                    st.write(f"**{t['tool']}**", t["args"] or "")
                    st.json(t["result"], expanded=False)

# Ô nhập câu hỏi dưới cùng
chat_input_val = st.chat_input("Nhập câu hỏi của bạn...")
prompt = triggered_prompt or chat_input_val

st.markdown("""
<div class="unifs-ready-footer">
    <span class="green-dot"></span>UniFs luôn sẵn sàng hỗ trợ bạn!
</div>
""", unsafe_allow_html=True)

if prompt:
    history = list(st.session_state.messages)
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user", avatar="🧑‍🎓"):
        st.markdown(prompt)
    with st.chat_message("assistant", avatar=bot_avatar):
        text = ""
        tools = []
        try:
            if use_llm:
                agent = get_agent(API_KEY, MODEL)
                with st.spinner("UniFs đang phân tích dữ liệu học vụ..."):
                    stream_gen, tools = agent.respond_stream(history, prompt, adv)
                text = st.write_stream(stream_gen)
            else:
                text, tools = fallback.answer(prompt, adv)
                st.markdown(text)
        except Exception:
            log.exception("Lỗi xử lý từ hệ thống AI")
            text, tools = fallback.answer(prompt, adv)
            text = f"⚠️ Hệ thống AI tạm thời bận, UniFs đã chuyển sang chế độ phân tích trực tiếp:\n\n{text}"
            st.markdown(text)
    st.session_state.messages.append({"role": "assistant", "content": text, "tools": tools})
    save_student_chat(sid, st.session_state.messages)
    st.rerun()
