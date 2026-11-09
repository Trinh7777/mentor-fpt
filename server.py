"""
UniFs Pro — Full-Stack FastAPI Backend Server & FAP Extension Receiver.
- Chạy trên cổng 8000 (`python server.py` hoặc `python run.py`)
- Phục vụ REST API Xác thực (Đăng nhập, Đổi mật khẩu bcrypt, Quên/Reset mật khẩu OTP 6 số)
- Phục vụ Dashboard Học vụ 360°, Cây môn học 9 kỳ, Máy tính FE & Giả lập GPA What-If
- Phục vụ AI Chat Studio đa luồng hội thoại với SSE Streaming thời gian thực (Gemini + Hybrid RAG)
- Tương thích 100% với FAP Chrome Extension tại `/api/v1/update-student-data`
"""

import json
import logging
import math
import os
import socket
import sys
import threading

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import fallback
from advisor import StudentAdvisor
from auth_service import (
    create_session_token,
    get_secret,
    is_smtp_configured,
    mask_email,
    send_otp_email,
    validate_password_strength,
    verify_session_token,
)
from config import DEFAULT_CAMPUS, DEFAULT_MODEL, TUITION_PER_CREDIT
from data_loader import load_all
from database import (
    _is_postgres,
    change_student_password,
    create_chat_thread,
    create_password_reset_otp,
    delete_chat_thread,
    get_chat_thread,
    get_student_auth_logs,
    get_student_by_id,
    init_and_seed_db,
    list_chat_threads,
    quick_auth_fap_session,
    reset_student_password_with_token,
    save_chat_thread,
    update_student_campus,
    upsert_fap_sync_to_db,
    verify_password_reset_otp,
    verify_student_credentials,
)
from fap_simulator import router as fap_simulator_router
from telegram_bot import start_telegram_bot_if_configured

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("unifs_pro_server")

ROOT_DIR = Path(__file__).parent
ASSETS_DIR = ROOT_DIR / "assets"
STATIC_DIR = ROOT_DIR / "static"
PORT = int(os.getenv("PORT", "8000"))

_SERVER_STARTED = False
_LOCK = threading.Lock()
_AGENT_CACHE = {}


def _get_gemini_agent():
    api_key = get_secret("GEMINI_API_KEY")
    if not api_key:
        return None
    model = get_secret("GEMINI_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL
    cache_key = f"{api_key[:8]}:{model}"
    if cache_key not in _AGENT_CACHE:
        from llm import GeminiAgent
        _AGENT_CACHE[cache_key] = GeminiAgent(api_key=api_key, model=model)
    return _AGENT_CACHE[cache_key]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_and_seed_db()
    api_key = get_secret("GEMINI_API_KEY")
    start_telegram_bot_if_configured(api_key)
    log.info("🚀 UniFs Pro Full-Stack Server đã sẵn sàng tại http://localhost:%s", PORT)
    yield


app = FastAPI(
    title="UniFs Pro - FPT University AI Academic Ecosystem",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

if ASSETS_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(ASSETS_DIR)), name="assets")

app.include_router(fap_simulator_router)


# =========================================================================
# PYDANTIC SCHEMAS
# =========================================================================

class LoginRequest(BaseModel):
    identifier: str
    password: str
    campus: str = DEFAULT_CAMPUS
    remember_me: bool = True


class FapQuickLoginRequest(BaseModel):
    student_id: str
    campus: Optional[str] = None


class CampusUpdateRequest(BaseModel):
    campus: str


class ChangePasswordRequest(BaseModel):
    old_password: str
    new_password: str
    confirm_password: str


class ForgotPasswordRequest(BaseModel):
    identifier: str


class VerifyOtpRequest(BaseModel):
    identifier: str
    otp_code: str


class ResetPasswordRequest(BaseModel):
    reset_token: str
    new_password: str
    confirm_password: str


class FECalcRequest(BaseModel):
    coursework_avg: Optional[float] = Field(None, ge=0.0, le=10.0)
    subject_code: Optional[str] = None
    fe_weight: Optional[float] = None
    target_total: float = Field(5.0, ge=4.0, le=10.0)


class SimulateGPARequest(BaseModel):
    expected_grades: dict[str, float]


class TargetGPARequest(BaseModel):
    target_gpa: float = Field(..., ge=5.0, le=10.0)


class AttendanceCalcRequest(BaseModel):
    total_slots: int = Field(..., gt=0, le=100)
    absent_slots: int = Field(..., ge=0, le=100)


class CreateThreadRequest(BaseModel):
    title: Optional[str] = "Cuộc trò chuyện mới"


class ChatStreamRequest(BaseModel):
    prompt: str
    thread_id: Optional[str] = None


# =========================================================================
# AUTH DEPENDENCY
# =========================================================================

def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def get_current_session(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.")
    token = authorization.split(" ", 1)[1].strip()
    payload = verify_session_token(token)
    if not payload or not payload.get("sid"):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.")
    student = get_student_by_id(payload["sid"])
    if not student:
        raise HTTPException(status_code=401, detail="Không tìm thấy hồ sơ sinh viên của phiên này.")
    return {
        "student_id": student["student_id"],
        "campus": student.get("campus") or payload.get("campus") or DEFAULT_CAMPUS,
        "remember_me": bool(payload.get("rem", True)),
        "student": student,
    }


# =========================================================================
# HEALTH & DEMO ACCOUNTS
# =========================================================================

@app.get("/api/health")
def api_health():
    api_key = get_secret("GEMINI_API_KEY")
    return {
        "status": "ok",
        "service": "UniFs Pro Full-Stack Server",
        "port": PORT,
        "ai_mode": "gemini" if api_key else "fallback",
        "model": get_secret("GEMINI_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL,
        "db_engine": "PostgreSQL" if _is_postgres() else "SQLite",
        "smtp_configured": is_smtp_configured(),
        "campuses": list(TUITION_PER_CREDIT.keys()),
        "tuition_per_credit": TUITION_PER_CREDIT,
    }


@app.get("/api/auth/demo-accounts")
def api_demo_accounts():
    """Danh sách tài khoản kịch bản thực tế để giảng viên/sinh viên test nhanh 1-click."""
    personas = [
        {
            "student_id": "SE190456",
            "badge": "⚠️ Nguy cơ AF (Còn 1 buổi)",
            "badge_tone": "warning",
            "scenario": "Kỳ 5 · Học lực Giỏi · Môn DPL302m đã vắng 3/20 buổi",
        },
        {
            "student_id": "SE190457",
            "badge": "🚨 Đã cấm thi AF",
            "badge_tone": "danger",
            "scenario": "Kỳ 5 · Bị cấm thi môn BDI302c do vắng 25% (5/20 buổi)",
        },
        {
            "student_id": "SE190460",
            "badge": "💸 Nợ môn + Cấm thi",
            "badge_tone": "danger",
            "scenario": "Kỳ 5 · Đang nợ môn cần tính phí học lại + AF môn DSR301m",
        },
        {
            "student_id": "SE190459",
            "badge": "🔒 Kẹt môn tiên quyết",
            "badge_tone": "info",
            "scenario": "Kỳ 3 · Nợ MAD101 & PFP191 gây chặn chuỗi môn kỳ sau",
        },
        {
            "student_id": "SE190463",
            "badge": "🎓 Kỳ 9 Khóa luận KLTN",
            "badge_tone": "success",
            "scenario": "Kỳ 9 · Đang làm đồ án AIP491 & chuẩn bị xét tốt nghiệp",
        },
    ]
    out = []
    for p in personas:
        st_info = get_student_by_id(p["student_id"])
        if st_info:
            out.append({
                **p,
                "full_name": st_info["full_name"],
                "email": st_info["email"],
                "semester": st_info["current_semester"],
                "has_custom_password": st_info.get("has_custom_password", False),
                "default_password_hint": "Đã đổi mật khẩu riêng" if st_info.get("has_custom_password") else "123456",
            })
    return {"accounts": out}


# =========================================================================
# AUTHENTICATION, CHANGE PASSWORD & OTP PASSWORD RESET
# =========================================================================

@app.post("/api/auth/login")
def api_login(req: LoginRequest, request: Request):
    ip = _client_ip(request)
    sid, err = verify_student_credentials(req.identifier, req.password, ip_address=ip)
    if err:
        raise HTTPException(status_code=401, detail=err)

    chosen_campus = req.campus if req.campus in TUITION_PER_CREDIT else DEFAULT_CAMPUS
    update_student_campus(sid, chosen_campus)
    load_all.cache_clear()

    student = get_student_by_id(sid)
    token = create_session_token(sid, chosen_campus, remember_me=req.remember_me)
    return {
        "status": "success",
        "message": f"Chào mừng {student['full_name']} quay trở lại!",
        "token": token,
        "student": student,
    }


@app.post("/api/auth/fap-quick-login")
def api_fap_quick_login(req: FapQuickLoginRequest, request: Request):
    """Đăng nhập 1-click theo phiên FAP đang mở trên trình duyệt (nếu sinh viên chưa đặt mật khẩu riêng)."""
    ip = _client_ip(request)
    sid, err = quick_auth_fap_session(req.student_id, ip_address=ip)
    if err:
        st_existing = get_student_by_id(req.student_id)
        if st_existing and st_existing.get("has_custom_password"):
            return JSONResponse(
                status_code=403,
                content={
                    "status": "requires_password",
                    "code": "REQUIRES_PASSWORD",
                    "detail": err,
                    "student_id": st_existing["student_id"],
                    "full_name": st_existing["full_name"],
                    "email": st_existing["email"],
                },
            )
        raise HTTPException(status_code=404, detail=err)

    student = get_student_by_id(sid)
    chosen_campus = req.campus if req.campus in TUITION_PER_CREDIT else (student.get("campus") or DEFAULT_CAMPUS)
    if req.campus in TUITION_PER_CREDIT:
        update_student_campus(sid, chosen_campus)
        load_all.cache_clear()
        student = get_student_by_id(sid)

    token = create_session_token(sid, chosen_campus, remember_me=True)
    return {
        "status": "success",
        "message": f"Đã kết nối nhanh phiên FAP của {student['full_name']} ({sid})!",
        "token": token,
        "student": student,
    }


@app.get("/api/auth/me")
def api_me(session: dict = Depends(get_current_session)):
    sid = session["student_id"]
    return {
        "student": session["student"],
        "campus": session["campus"],
        "auth_logs": get_student_auth_logs(sid, limit=12),
        "smtp_configured": is_smtp_configured(),
        "campuses": list(TUITION_PER_CREDIT.keys()),
        "tuition_per_credit": TUITION_PER_CREDIT,
    }


@app.put("/api/auth/campus")
def api_update_campus(req: CampusUpdateRequest, session: dict = Depends(get_current_session)):
    if req.campus not in TUITION_PER_CREDIT:
        raise HTTPException(status_code=400, detail="Cơ sở đào tạo không hợp lệ.")
    sid = session["student_id"]
    update_student_campus(sid, req.campus)
    load_all.cache_clear()
    new_token = create_session_token(sid, req.campus, remember_me=session["remember_me"])
    return {
        "status": "success",
        "campus": req.campus,
        "token": new_token,
        "student": get_student_by_id(sid),
    }


@app.post("/api/auth/change-password")
def api_change_password(req: ChangePasswordRequest, request: Request, session: dict = Depends(get_current_session)):
    if req.new_password.strip() != req.confirm_password.strip():
        raise HTTPException(status_code=400, detail="Mật khẩu xác nhận không khớp với mật khẩu mới.")

    valid, msg, meta = validate_password_strength(req.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    ok, db_msg = change_student_password(
        session["student_id"],
        req.old_password,
        req.new_password,
        ip_address=_client_ip(request),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=db_msg)

    load_all.cache_clear()
    return {
        "status": "success",
        "message": db_msg,
        "strength": meta,
        "auth_logs": get_student_auth_logs(session["student_id"], limit=12),
    }


@app.post("/api/auth/forgot-password")
def api_forgot_password(req: ForgotPasswordRequest, request: Request):
    otp_info, err = create_password_reset_otp(req.identifier, ip_address=_client_ip(request))
    if err:
        raise HTTPException(status_code=404, detail=err)

    mail_res = send_otp_email(
        to_email=otp_info["email"],
        full_name=otp_info["full_name"],
        student_id=otp_info["student_id"],
        otp_code=otp_info["otp_code"],
    )

    resp = {
        "status": "success",
        "student_id": otp_info["student_id"],
        "full_name": otp_info["full_name"],
        "masked_email": mask_email(otp_info["email"]),
        "expires_in": otp_info["expires_in"],
        "delivery_mode": mail_res["delivery_mode"],
        "message": mail_res["message"],
    }
    if mail_res["delivery_mode"] == "demo":
        resp["demo_otp"] = otp_info["otp_code"]
    return resp


@app.post("/api/auth/verify-otp")
def api_verify_otp(req: VerifyOtpRequest):
    reset_token, err = verify_password_reset_otp(req.identifier, req.otp_code)
    if err:
        raise HTTPException(status_code=400, detail=err)
    return {
        "status": "success",
        "reset_token": reset_token,
        "message": "Xác thực mã OTP thành công! Vui lòng nhập mật khẩu mới.",
    }


@app.post("/api/auth/reset-password")
def api_reset_password(req: ResetPasswordRequest, request: Request):
    if req.new_password.strip() != req.confirm_password.strip():
        raise HTTPException(status_code=400, detail="Mật khẩu xác nhận không trùng khớp.")

    valid, msg, _ = validate_password_strength(req.new_password)
    if not valid:
        raise HTTPException(status_code=400, detail=msg)

    ok, reset_msg, sid = reset_student_password_with_token(
        req.reset_token,
        req.new_password,
        ip_address=_client_ip(request),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=reset_msg)

    load_all.cache_clear()
    return {
        "status": "success",
        "message": reset_msg,
        "student_id": sid,
    }


# =========================================================================
# ACADEMIC DASHBOARD 360°, ROADMAP & INTERACTIVE TOOLS
# =========================================================================

@app.get("/api/dashboard/overview")
def api_dashboard_overview(session: dict = Depends(get_current_session)):
    sid = session["student_id"]
    campus = session["campus"]
    adv = StudentAdvisor(sid, campus)

    subjects_catalog = sorted(
        list(adv.d["subjects"].values()),
        key=lambda x: (x["semester"], x["subject_code"]),
    )

    return {
        "profile": {
            **adv.profile(),
            "campus": campus,
            "tuition_per_credit": TUITION_PER_CREDIT.get(campus, TUITION_PER_CREDIT[DEFAULT_CAMPUS]),
        },
        "gpa": adv.gpa(),
        "progress": adv.progress(),
        "forecast": adv.predict_graduation_forecast(),
        "eligibility": adv.check_ojt_and_graduation_eligibility(),
        "attendance": adv.get_attendance_details(),
        "coursework": adv.get_component_grades(),
        "schedule": adv.get_schedule(),
        "retake_fee": adv.retake_fee(),
        "transcript": adv.transcript(),
        "suggest_next": adv.suggest_next(),
        "subjects_catalog": subjects_catalog,
    }


@app.get("/api/dashboard/roadmap")
def api_dashboard_roadmap(session: dict = Depends(get_current_session)):
    adv = StudentAdvisor(session["student_id"], session["campus"])
    roadmap = adv.curriculum_roadmap()
    prog = adv.progress()
    return {
        "semesters": {str(k): v for k, v in sorted(roadmap.items())},
        "suggest_next": adv.suggest_next(),
        "summary": {
            "credits_passed": prog["credits_passed"],
            "credits_total": prog["credits_total"],
            "percent": prog["percent"],
            "passed_count": len(prog["passed"]),
            "studying_count": len(prog["studying"]),
            "failed_count": len(prog["failed_pending_retake"]),
            "remaining_count": len(prog["not_taken_yet"]),
        },
    }


@app.post("/api/tools/fe-calculator")
def api_tool_fe_calculator(req: FECalcRequest, session: dict = Depends(get_current_session)):
    adv = StudentAdvisor(session["student_id"], session["campus"])
    return adv.calculate_required_final_score(
        coursework_avg=req.coursework_avg,
        subject_code=req.subject_code,
        fe_weight=req.fe_weight,
        target_total=req.target_total,
    )


@app.post("/api/tools/simulate-gpa")
def api_tool_simulate_gpa(req: SimulateGPARequest, session: dict = Depends(get_current_session)):
    adv = StudentAdvisor(session["student_id"], session["campus"])
    return adv.simulate_semester_grades(req.expected_grades)


@app.post("/api/tools/target-gpa")
def api_tool_target_gpa(req: TargetGPARequest, session: dict = Depends(get_current_session)):
    adv = StudentAdvisor(session["student_id"], session["campus"])
    return adv.plan_target_gpa(req.target_gpa)


@app.post("/api/tools/attendance-calc")
def api_tool_attendance_calc(req: AttendanceCalcRequest, session: dict = Depends(get_current_session)):
    return StudentAdvisor.check_attendance(req.total_slots, req.absent_slots)


@app.post("/api/fap/refresh")
def api_fap_refresh(session: dict = Depends(get_current_session)):
    load_all.cache_clear()
    return {"status": "success", "message": "Đã làm mới dữ liệu học vụ từ Database thành công!"}


# =========================================================================
# MULTI-THREAD AI CHAT STUDIO + REAL-TIME SSE STREAMING
# =========================================================================

@app.get("/api/chat/threads")
def api_list_threads(session: dict = Depends(get_current_session)):
    return {"threads": list_chat_threads(session["student_id"])}


@app.post("/api/chat/threads")
def api_create_thread(req: CreateThreadRequest, session: dict = Depends(get_current_session)):
    return create_chat_thread(session["student_id"], req.title or "Cuộc trò chuyện mới")


@app.get("/api/chat/threads/{thread_id}")
def api_get_thread(thread_id: str, session: dict = Depends(get_current_session)):
    thr = get_chat_thread(session["student_id"], thread_id)
    if not thr:
        raise HTTPException(status_code=404, detail="Không tìm thấy cuộc trò chuyện này.")
    return thr


@app.delete("/api/chat/threads/{thread_id}")
def api_delete_thread(thread_id: str, session: dict = Depends(get_current_session)):
    delete_chat_thread(session["student_id"], thread_id)
    return {"status": "success"}


def _build_smart_title(prompt: str) -> str:
    clean = " ".join((prompt or "").strip().split())
    return (clean[:44] + "...") if len(clean) > 44 else (clean or "Cuộc trò chuyện mới")


@app.post("/api/chat/stream")
def api_chat_stream(req: ChatStreamRequest, session: dict = Depends(get_current_session)):
    prompt = (req.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="Câu hỏi không được để trống.")

    sid = session["student_id"]
    campus = session["campus"]
    adv = StudentAdvisor(sid, campus)

    # Lấy hoặc tạo thread hội thoại
    existing_thr = get_chat_thread(sid, req.thread_id) if req.thread_id else None
    if not existing_thr:
        existing_thr = create_chat_thread(sid, _build_smart_title(prompt))
    thread_id = existing_thr["thread_id"]
    history = list(existing_thr.get("messages", []))

    is_first_message = len(history) == 0
    new_title = _build_smart_title(prompt) if is_first_message or existing_thr["title"] == "Cuộc trò chuyện mới" else existing_thr["title"]

    def sse_generator():
        yield f"data: {json.dumps({'type': 'meta', 'thread_id': thread_id, 'title': new_title}, ensure_ascii=False)}\n\n"

        accumulated = []
        tools_used = []
        agent = _get_gemini_agent()

        try:
            if agent is not None:
                stream_gen, tools_used = agent.respond_stream(history, prompt, adv)
                for chunk in stream_gen:
                    if chunk:
                        accumulated.append(chunk)
                        yield f"data: {json.dumps({'type': 'token', 'text': chunk}, ensure_ascii=False)}\n\n"
            else:
                ans, tools_used = fallback.answer(prompt, adv)
                accumulated.append(ans)
                yield f"data: {json.dumps({'type': 'token', 'text': ans}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            log.warning("Gemini stream gặp sự cố (%s), chuyển sang chế độ phân tích trực tiếp.", exc)
            joined_so_far = "".join(accumulated).strip()
            if not joined_so_far or len(joined_so_far) < 45 or joined_so_far.endswith("**"):
                ans, fb_tools = fallback.answer(prompt, adv)
                tools_used = fb_tools or tools_used
                prefix = "\n\n" if joined_so_far else ""
                fallback_msg = f"{prefix}⚡ *Chế độ Phân tích Học vụ Trực tiếp:*\n\n{ans}"
                accumulated.append(fallback_msg)
                yield f"data: {json.dumps({'type': 'token', 'text': fallback_msg}, ensure_ascii=False)}\n\n"

        final_text = "".join(accumulated).strip() or "Mình chưa trả lời được câu này, bạn thử hỏi cụ thể hơn nhé!"

        # Tóm tắt danh sách tool đã gọi để hiển thị gọn đẹp trên giao diện
        compact_tools = [
            {"tool": t.get("tool"), "args": t.get("args")}
            for t in (tools_used or [])
        ]

        updated_messages = history + [
            {"role": "user", "content": prompt},
            {"role": "assistant", "content": final_text, "tools": compact_tools},
        ]
        saved_meta = save_chat_thread(sid, thread_id, updated_messages, title=new_title)

        yield f"data: {json.dumps({'type': 'tools', 'tools': compact_tools}, ensure_ascii=False)}\n\n"
        yield f"data: {json.dumps({'type': 'done', 'thread': saved_meta}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =========================================================================
# FAP CHROME EXTENSION RECEIVER (100% BACKWARD COMPATIBLE)
# =========================================================================

@app.post("/api/v1/update-student-data")
async def api_update_student_data(request: Request):
    try:
        payload = await request.json()
        student_id = (payload.get("student_id") or "UNKNOWN").strip().upper()
        transcript_records = payload.get("transcript") or []
        raw_attendance = payload.get("attendance") or []

        if raw_attendance and isinstance(raw_attendance, list) and (not isinstance(raw_attendance[0], dict) or "subject_code" not in raw_attendance[0]):
            total_s = len(raw_attendance)
            absent_s = sum(
                1 for r in raw_attendance
                if isinstance(r, dict) and any("absent" in str(x).lower() or "vắng" in str(x).lower() for x in r.get("data", []))
            )
            attended_s = sum(
                1 for r in raw_attendance
                if isinstance(r, dict) and any("present" in str(x).lower() or "có mặt" in str(x).lower() for x in r.get("data", []))
            )
            max_abs = math.floor(max(total_s, 20) * 0.20)
            rem_abs = max(max_abs - absent_s, 0)
            is_af = absent_s > max_abs
            payload["attendance"] = {
                "student_id": student_id,
                "subject_code": payload.get("current_subject") or "FAP-LIVE",
                "subject_name": "Môn đồng bộ từ FAP",
                "class_name": "FAP-SYNC",
                "lecturer": "FAP Lecturer",
                "total_slots": max(total_s, 20),
                "current_slot": attended_s + absent_s,
                "absent_slots": absent_s,
                "attended_slots": attended_s,
                "absent_rate_current": f"{round(100 * absent_s / max(attended_s + absent_s, 1), 1)}%",
                "absent_rate_total": f"{round(100 * absent_s / max(total_s, 20), 1)}%",
                "max_allowed_absent": max_abs,
                "remaining_allowed_absent": rem_abs,
                "is_attendance_fail": is_af,
                "warning_status": (
                    "🚨 BỊ CẤM THI (AF)!"
                    if is_af
                    else f"✅ Đã vắng {absent_s}/{max(total_s, 20)} buổi (còn được phép vắng {rem_abs} buổi)."
                ),
                "records": [],
            }

        db_res = upsert_fap_sync_to_db(payload)
        load_all.cache_clear()

        att_cnt = db_res.get("attendance_courses_count", 0)
        comp_cnt = db_res.get("component_courses_count", 0)
        return {
            "status": "success",
            "message": (
                f"Đã đồng bộ song song FAP cho {student_id}: "
                f"{len(transcript_records)} môn bảng điểm, {att_cnt} lớp điểm danh, {comp_cnt} bảng điểm TP!"
            ),
            "student_id": student_id,
            "db_result": db_res,
        }
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(exc)})


# =========================================================================
# FRONTEND SPA STATIC HOSTING
# =========================================================================

if (STATIC_DIR / "static-assets").exists():
    app.mount("/static-assets", StaticFiles(directory=str(STATIC_DIR / "static-assets")), name="spa_assets")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if full_path.startswith(("api/", "fap-simulator/")):
        raise HTTPException(status_code=404, detail="Endpoint không tồn tại.")

    if STATIC_DIR.exists():
        candidate = (STATIC_DIR / full_path).resolve()
        if full_path and candidate.is_file() and str(candidate).startswith(str(STATIC_DIR.resolve())):
            return FileResponse(str(candidate))
        index_file = STATIC_DIR / "index.html"
        if index_file.exists():
            return FileResponse(str(index_file))

    return JSONResponse({
        "status": "ok",
        "service": "UniFs Pro API Server",
        "message": "Giao diện Web SPA chưa được build vào thư mục static/.",
    })


# =========================================================================
# BACKWARD-COMPATIBLE HELPERS & RUNNER
# =========================================================================

def is_port_in_use(port: int = PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_background_server() -> bool:
    """Giữ tương thích nếu khởi chạy ngầm từ Streamlit app.py."""
    global _SERVER_STARTED
    with _LOCK:
        if _SERVER_STARTED or is_port_in_use(PORT):
            _SERVER_STARTED = True
            return True
        try:
            import uvicorn
            cfg = uvicorn.Config(app, host="127.0.0.1", port=PORT, log_level="warning")
            srv = uvicorn.Server(cfg)
            t = threading.Thread(target=srv.run, daemon=True, name="UniFsFastAPIBackground")
            t.start()
            _SERVER_STARTED = True
            return True
        except Exception:
            return False


def run_server(open_browser: bool = False):
    import uvicorn
    if open_browser:
        import webbrowser
        threading.Timer(1.2, lambda: webbrowser.open(f"http://localhost:{PORT}")).start()
    print(f"\n✨ UniFs Pro Web App đang chạy tại: http://localhost:{PORT}")
    print(f"🔌 FAP Chrome Extension Endpoint : http://localhost:{PORT}/api/v1/update-student-data\n")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")


if __name__ == "__main__":
    run_server()
