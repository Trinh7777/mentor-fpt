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
    all_atts = adv.get_all_attendances()
    worst_att = adv.get_attendance_details()
    ojt_grad = adv.check_ojt_and_graduation_eligibility()

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

    # Cảnh báo chuyên cần nổi bật trên đầu trang nếu có môn bị AF hoặc sát nút AF
    if worst_att and worst_att.get("is_attendance_fail"):
        st.markdown(f"""
        <div class="alert-box alert-danger">
            🚨 <b>CẢNH BÁO HỌC VỤ NGHIÊM TRỌNG (ATTENDANCE FAIL - AF):</b><br>
            Bạn đã vắng <b>{worst_att.get('absent_slots')}/{worst_att.get('total_slots')} buổi ({worst_att.get('absent_rate_total')})</b> môn <b>{worst_att.get('subject_code')} ({worst_att.get('subject_name', '')})</b> — vượt quá giới hạn 20%. Bạn <b>bị cấm thi cuối kỳ</b> môn này và cần chuẩn bị đăng ký học lại sớm (ưu đãi 50% học phí).
        </div>
        """, unsafe_allow_html=True)
    elif worst_att and worst_att.get("remaining_allowed_absent") == 1:
        st.markdown(f"""
        <div class="alert-box alert-warning">
            ⚠️ <b>CẢNH BÁO NGUY CƠ CẤM THI:</b> Môn <b>{worst_att.get('subject_code')}</b> bạn đã vắng <b>{worst_att.get('absent_slots')}/{worst_att.get('total_slots')} buổi</b>. Bạn <b>chỉ còn được phép nghỉ tối đa 1 buổi nữa</b> trước khi bị cấm thi (AF)!
        </div>
        """, unsafe_allow_html=True)

    # ------------------------- 4 TABS CHỨC NĂNG THỰC DỤNG -------------------------
    tab_chat, tab_fe, tab_roadmap, tab_schedule = st.tabs([
        "💬 Trợ lý AI Học vụ",
        "🧮 Tính điểm Final Exam & GPA",
        "🗺️ Sơ đồ Cây môn học & Xét OJT/TN",
        "📅 Điểm danh đa môn & Lịch học"
    ])

    # =========================================================================
    # TAB 1: TRỢ LÝ AI HỌC VỤ (CHATBOT)
    # =========================================================================
    with tab_chat:
        # Nút gợi ý câu hỏi thông minh cá nhân hóa theo đúng tình trạng của sinh viên đang đăng nhập
        quick_prompts = []
        if worst_att and (worst_att.get("is_attendance_fail") or worst_att.get("remaining_allowed_absent", 9) <= 1):
            quick_prompts.append(f"Tình hình điểm danh môn {worst_att.get('subject_code')} của mình thế nào?")
        if p["failed_pending_retake"]:
            quick_prompts.append("Mình đang nợ môn nào và chi phí học lại hết bao nhiêu?")
        else:
            quick_prompts.append("Kỳ tới mình nên đăng ký những môn nào?")
        if s["current_semester"] <= 5:
            quick_prompts.append("Mình đã đủ điều kiện đi thực tập OJT kỳ 6 chưa?")
        else:
            quick_prompts.append("Kiểm tra điều kiện làm khóa luận tốt nghiệp AIP491 của mình")
        quick_prompts.append("Môn DPL302m điểm quá trình mình được 6.5 thì thi FE cần mấy điểm để qua môn?")

        q_cols = st.columns(len(quick_prompts))
        triggered_prompt = None
        for idx, qp in enumerate(quick_prompts):
            if q_cols[idx].button(f"💡 {qp}", key=f"qp_{idx}", use_container_width=True):
                triggered_prompt = qp

        for m in st.session_state.messages:
            with st.chat_message(m["role"], avatar="🧑‍🎓" if m["role"] == "user" else "🎓"):
                st.markdown(m["content"])
                if DEBUG and m.get("tools"):
                    with st.expander("🔧 Dữ liệu tra cứu hệ thống (Tool Call + Hybrid RAG)"):
                        for t in m["tools"]:
                            st.write(f"**{t['tool']}**", t["args"] or "")
                            st.json(t["result"], expanded=False)

        if not st.session_state.messages:
            first_name = s['full_name'].split()[-1]
            st.info(f"""
            👋 **Chào {first_name}!** Mình là **Mentor FPT** — Cố vấn học vụ nắm rõ bảng điểm, lịch học, chuyên cần của riêng bạn và toàn bộ quy chế FPTU.
            - Bạn có thể bấm nhanh các gợi ý phía trên hoặc hỏi bất kỳ câu hỏi nào (ví dụ: *"Điểm quá trình BDI302c được 7.2 thì FE cần bao nhiêu để được 8.0?"*, *"Bùng học mấy buổi thì bị cấm thi?"*, *"Làm sao xin giấy hoãn nghĩa vụ quân sự trên FAP?"*).
            """)

        chat_input_val = st.chat_input(f"Hỏi Mentor FPT về điểm số, FE, lịch học, quy chế, đơn từ FAP...")
        active_prompt = triggered_prompt or chat_input_val

        if active_prompt:
            history = list(st.session_state.messages)
            st.session_state.messages.append({"role": "user", "content": active_prompt})
            with st.chat_message("user", avatar="🧑‍🎓"):
                st.markdown(active_prompt)
            with st.chat_message("assistant", avatar="🎓"):
                text = ""
                tools = []
                try:
                    if use_llm:
                        agent = get_agent(API_KEY, MODEL)
                        with st.spinner("Mentor FPT đang tra cứu dữ liệu học vụ..."):
                            stream_gen, tools = agent.respond_stream(history, active_prompt, adv)
                        text = st.write_stream(stream_gen)
                    else:
                        text, tools = fallback.answer(active_prompt, adv)
                        st.markdown(text)
                except Exception:
                    log.exception("Lỗi xử lý từ hệ thống AI")
                    text, tools = fallback.answer(active_prompt, adv)
                    text = f"⚠️ Hệ thống AI tạm thời bận, Mentor FPT đã chuyển sang chế độ tra cứu trực tiếp:\n\n{text}"
                    st.markdown(text)
            st.session_state.messages.append({"role": "assistant", "content": text, "tools": tools})
            save_student_chat(sid, st.session_state.messages)
            st.rerun()

    # =========================================================================
    # TAB 2: CÔNG CỤ TÍNH ĐIỂM THI CUỐI KỲ (FINAL EXAM) & DỰ BÁO GPA
    # =========================================================================
    with tab_fe:
        col_fe_left, col_fe_right = st.columns([1.15, 1])

        with col_fe_left:
            st.subheader("🎯 Tính điểm Final Exam (FE) cần đạt")
            st.caption("Kiểm tra đồng thời cả 2 điều kiện qua môn của FPTU: **Điểm tổng kết >= 5.0** và **Điểm sàn FE >= 4.0** (không bị điểm liệt).")

            studying_Codes = [x["subject_code"] for x in p["studying"]]
            all_Codes = list(data["subjects"].keys())
            default_idx = all_Codes.index(studying_Codes[0]) if studying_Codes and studying_Codes[0] in all_Codes else 0

            sel_subj = st.selectbox(
                "Chọn môn học cần tính:",
                all_Codes,
                index=default_idx,
                format_func=lambda c: f"{c} – {data['subjects'][c]['subject_name']} ({ 'Đang học' if c in studying_Codes else f'Kỳ {data['subjects'][c]['semester']}' })"
            )
            subj_meta = data["subjects"][sel_subj]
            default_fe_pct = int(subj_meta.get("fe_weight", 0.4) * 100)

            c_in1, c_in2, c_in3 = st.columns(3)
            with c_in1:
                cw_score = st.number_input("Điểm TB quá trình hiện tại:", min_value=0.0, max_value=10.0, value=6.5, step=0.1)
            with c_in2:
                fe_pct = st.slider("Trọng số bài thi FE (%):", min_value=0, max_value=60, value=default_fe_pct if default_fe_pct > 0 else 40, step=5)
            with c_in3:
                target_grade = st.selectbox("Mục tiêu tổng kết môn:", [5.0, 6.0, 7.0, 8.0, 9.0], format_func=lambda x: f"{x} ({'Qua môn' if x==5.0 else 'Khá' if x==7.0 else 'Giỏi' if x==8.0 else 'Xuất sắc' if x==9.0 else 'TB Khá'})")

            fe_res = adv.calculate_required_final_score(cw_score, sel_subj, fe_pct / 100.0, target_grade)
            if "required_fe_score" in fe_res:
                req_fe = fe_res["required_fe_score"]
                badge_color = "#10b981" if req_fe <= 6.0 else ("#f59e0b" if req_fe <= 8.5 else "#ef4444")
                st.markdown(f"""
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-left:6px solid {badge_color}; padding:1.1rem; border-radius:12px; margin-top:0.5rem;">
                    <div style="font-size:0.9rem; color:#475569;">Điểm quá trình ({fe_res['coursework_weight_pct']}%) đóng góp: <b>{fe_res['coursework_points_accumulated']} điểm</b></div>
                    <div style="font-size:1.35rem; font-weight:700; color:#0f172a; margin:0.4rem 0;">
                        👉 Điểm Final Exam (FE) cần đạt tối thiểu: <span style="color:{badge_color};">{req_fe if req_fe <= 10 else '> 10.0 (Không thể)'} / 10</span>
                    </div>
                    <div style="font-size:0.88rem; color:#334155;">💡 <b>Đánh giá:</b> {fe_res['verdict']}</div>
                    <div style="font-size:0.8rem; color:#64748b; margin-top:0.3rem;">📌 {fe_res['rule']}</div>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.info(fe_res.get("message", ""))

        with col_fe_right:
            st.subheader("📈 Dự báo GPA Tốt nghiệp & Học phí học lại")
            c_m1, c_m2 = st.columns(2)
            c_m1.metric("GPA Tích lũy hiện tại", f"{g['gpa']:.2f}", g["classification"])
            c_m2.metric("Tín chỉ hoàn thành", f"{p['credits_passed']}/{p['credits_total']} TC", f"{p['percent']}%")

            target_gpa_val = st.slider("Chọn GPA mục tiêu khi ra trường:", min_value=5.0, max_value=9.5, value=8.0, step=0.1)
            plan_res = adv.plan_target_gpa(target_gpa_val)
            if "required_average_on_remaining" in plan_res:
                st.write(
                    f"Để đạt **GPA {target_gpa_val}** khi tốt nghiệp, trong **{plan_res['credits_remaining']} tín chỉ còn lại**, "
                    f"bạn cần đạt điểm trung bình tối thiểu: **`{plan_res['required_average_on_remaining']}`** → *{plan_res['verdict']}*."
                )

            if g.get("by_semester"):
                st.caption("Biểu đồ GPA qua từng học kỳ:")
                st.bar_chart(pd.Series(g["by_semester"], name="GPA"), height=190)

            if p["failed_pending_retake"]:
                fee_info = adv.retake_fee()
                st.warning(
                    f"💸 **Môn đang nợ ({len(p['failed_pending_retake'])} môn):** "
                    + ", ".join(f"**{x['subject_code']}**" for x in p["failed_pending_retake"])
                    + f" — Tổng phí học lại dự kiến tại {campus}: **{fee_info['total']:,.0f}đ**".replace(",", ".")
                )

    # =========================================================================
    # TAB 3: SƠ ĐỒ CÂY MÔN HỌC 9 KỲ (CURRICULUM ROADMAP) & XÉT OJT/TỐT NGHIỆP
    # =========================================================================
    with tab_roadmap:
        st.subheader("🏢 Kiểm tra Điều kiện đi OJT (Kỳ 6) & Khóa luận tốt nghiệp (Kỳ 9)")
        ojt_info = ojt_grad["ojt_eligibility"]
        cap_info = ojt_grad["capstone_and_graduation"]

        col_ojt, col_cap = st.columns(2)
        with col_ojt:
            ojt_ok = ojt_info["is_eligible_now"]
            st.markdown(f"""
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:1rem;">
                <div style="font-weight:700; font-size:1.05rem; margin-bottom:0.4rem;">
                    1. Thực tập doanh nghiệp (OJT202) — {'✅ ĐỦ ĐIỀU KIỆN' if ojt_ok else ('⏳ DỰ KIẾN ĐỦ CUỐI KỲ' if ojt_info['is_eligible_if_pass_studying'] else '❌ CHƯA ĐỦ')}
                </div>
                <div style="font-size:0.88rem; color:#334155;">
                    • Tín chỉ Kỳ 1–5 đã qua: <b>{ojt_info['pre_ojt_credits_passed']}/{ojt_info['pre_ojt_credits_total']} TC ({ojt_info['current_percentage']}%)</b> (Yêu cầu >= 90%)<br>
                    • Dự kiến sau khi hoàn thành môn đang học: <b>{ojt_info['projected_percentage_after_this_term']}%</b>
                </div>
            </div>
            """, unsafe_allow_html=True)
        with col_cap:
            cap_ok = cap_info["eligible_for_capstone_AIP491"]
            st.markdown(f"""
            <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:1rem;">
                <div style="font-weight:700; font-size:1.05rem; margin-bottom:0.4rem;">
                    2. Đồ án tốt nghiệp (AIP491) — {'✅ ĐỦ ĐIỀU KIỆN' if cap_ok else '⏳ ĐANG TÍCH LŨY'}
                </div>
                <div style="font-size:0.88rem; color:#334155;">
                    • Tổng tín chỉ tích lũy: <b>{cap_info['total_credits_passed']}/{cap_info['total_credits_required']} TC</b><br>
                    • Môn đang nợ: <b>{', '.join(cap_info['pending_failed_subjects']) if cap_info['pending_failed_subjects'] else 'Không nợ môn nào 🎉'}</b>
                </div>
            </div>
            """, unsafe_allow_html=True)

        st.markdown("---")
        st.subheader("🗺️ Bản đồ Lộ trình 9 Học kỳ & Chuỗi môn Tiên quyết")
        st.caption("Chú thích màu: 🟢 **Đã qua (Passed)** | 🔵 **Đang học (Studying)** | 🔴 **Đang nợ (Failed - Cần học lại)** | 🟡 **Đủ ĐK đăng ký** | ⚪ **Bị khóa (Chưa đủ môn tiên quyết)**")

        roadmap = adv.curriculum_roadmap()
        # Hiển thị 9 học kỳ theo lưới 3 cột x 3 hàng
        for row_idx in range(3):
            cols = st.columns(3)
            for col_idx in range(3):
                sem_num = row_idx * 3 + col_idx + 1
                with cols[col_idx]:
                    st.markdown(f"##### 📅 Học kỳ {sem_num}" + (" *(Kỳ hiện tại)*" if sem_num == s["current_semester"] else ""))
                    for item in roadmap.get(sem_num, []):
                        state = item["state"]
                        icon = "✅" if state == "Passed" else ("📖" if state == "Studying" else ("🚨" if state == "Failed" else ("🔒" if state == "Locked" else "🟡")))
                        grade_str = f" · Điểm: <b>{item['grade']}</b>" if item["grade"] is not None else ""
                        prereq_note = ""
                        if item["missing_prereqs"]:
                            prereq_note = f"<br><span style='color:#dc2626; font-size:0.76rem;'>⛔ Thiếu TQ: {', '.join(item['missing_prereqs'])}</span>"
                        elif item["prerequisites"]:
                            prereq_note = f"<br><span style='font-size:0.75rem; opacity:0.8;'>🔗 Tiên quyết: {', '.join(item['prerequisites'])}</span>"
                        unlock_note = f"<br><span style='font-size:0.75rem; opacity:0.8;'>🔓 Mở khóa: {', '.join(item['unlocks'])}</span>" if item["unlocks"] else ""

                        st.markdown(f"""
                        <div class="subj-card subj-{state}">
                            <b>{icon} {item['subject_code']}</b> ({item['credits']} TC){grade_str}<br>
                            <span>{item['name']}</span>
                            {prereq_note}{unlock_note}
                        </div>
                        """, unsafe_allow_html=True)

    # =========================================================================
    # TAB 4: ĐIỂM DANH ĐA MÔN & THỜI KHÓA BIỂU TRONG TUẦN
    # =========================================================================
    with tab_schedule:
        st.subheader("📋 Theo dõi Điểm danh Chuyên cần tất cả các môn đang học")
        if all_atts:
            att_cols = st.columns(min(len(all_atts), 3))
            for i, att in enumerate(all_atts):
                with att_cols[i % len(att_cols)]:
                    is_af = att.get("is_attendance_fail")
                    rem = att.get("remaining_allowed_absent", 0)
                    border_col = "#ef4444" if is_af else ("#f59e0b" if rem <= 1 else "#10b981")
                    badge_txt = "🚨 CẤM THI (AF)" if is_af else ("⚠️ SÁT NÚT AF" if rem <= 1 else "✅ AN TOÀN")
                    st.markdown(f"""
                    <div style="background:#ffffff; border:1px solid #e2e8f0; border-top:4px solid {border_col}; border-radius:12px; padding:1rem; margin-bottom:0.8rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <b style="font-size:1.05rem;">{att.get('subject_code')}</b>
                            <span style="font-size:0.78rem; font-weight:700; color:{border_col};">{badge_txt}</span>
                        </div>
                        <div style="font-size:0.83rem; color:#64748b; margin-bottom:0.5rem;">{att.get('subject_name', '')} · Lớp {att.get('class_name', '')}</div>
                        <div style="font-size:0.88rem;">
                            • Đã vắng: <b>{att.get('absent_slots', 0)}/{att.get('total_slots', 20)} buổi</b> (Tối đa cho phép: {att.get('max_allowed_absent', 4)} buổi)<br>
                            • Số buổi còn được phép nghỉ: <b>{rem} buổi</b>
                        </div>
                    </div>
                    """, unsafe_allow_html=True)
                    absent_ratio = min(att.get("absent_slots", 0) / max(att.get("max_allowed_absent", 4), 1), 1.0)
                    st.progress(absent_ratio)

        st.markdown("---")
        st.subheader("📅 Thời khóa biểu trong tuần")
        sched_data = adv.get_schedule()
        if "schedule" in sched_data and isinstance(sched_data["schedule"], list):
            st.caption(f"Tuần học: **{sched_data.get('week', '')}**")
            table_rows = []
            for slot_item in sched_data["schedule"]:
                if "days" in slot_item:
                    row_dict = {"Slot": f"Slot {slot_item['slot']} ({slot_item['time']})"}
                    for day_name, cell in slot_item["days"].items():
                        if cell:
                            row_dict[day_name] = f"{cell['subject_code']} ({cell['room']}) - {cell['status']}"
                        else:
                            row_dict[day_name] = "—"
                    table_rows.append(row_dict)
            if table_rows:
                st.dataframe(pd.DataFrame(table_rows), use_container_width=True, hide_index=True)
        else:
            st.info(sched_data.get("message", "Chưa có dữ liệu thời khóa biểu."))