"""Tầng Cơ sở dữ liệu (Database Layer) hỗ trợ kép:
- Mặc định: SQLite Database (`data/mentor_fpt.db`) chạy ngay lập tức không cần cài đặt.
- Cloud: PostgreSQL / Supabase / Neon nếu có biến môi trường hoặc secret `DATABASE_URL`.
Tự động tạo bảng (Auto-Schema) và di trú (Auto-Migrate) toàn bộ dữ liệu từ các file JSON lên Database trong lần chạy đầu tiên."""

import hashlib
import json
import os
import sqlite3
from pathlib import Path
from config import DATA_DIR

DB_FILE = DATA_DIR / "mentor_fpt.db"


def hash_password(raw_password: str) -> str:
    """Băm mật khẩu bằng SHA-256."""
    return hashlib.sha256(raw_password.strip().encode("utf-8")).hexdigest()


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        return url
    try:
        import streamlit as st
        return st.secrets.get("DATABASE_URL", "").strip()
    except Exception:
        return ""


def _is_postgres() -> bool:
    url = get_database_url()
    return url.startswith("postgres://") or url.startswith("postgresql://")


def get_connection():
    """Trả về connection tới PostgreSQL (nếu cấu hình DATABASE_URL) hoặc SQLite local (`data/mentor_fpt.db`)."""
    if _is_postgres():
        import psycopg2
        return psycopg2.connect(get_database_url())
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _ph(count: int = 1) -> str:
    """Placeholder cho câu lệnh SQL (%s cho Postgres, ? cho SQLite)."""
    sym = "%s" if _is_postgres() else "?"
    return ", ".join([sym] * count)


def init_and_seed_db():
    """Tạo đầy đủ các bảng SQL và tự động nạp dữ liệu từ data/*.json nếu bảng đang trống."""
    conn = get_connection()
    cur = conn.cursor()

    # 1. Tạo các bảng SQL chuẩn
    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            student_id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT,
            major TEXT,
            current_semester INTEGER DEFAULT 1,
            status TEXT DEFAULT 'Studying',
            password_hash TEXT NOT NULL,
            telegram_chat_id TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS subjects (
            subject_code TEXT PRIMARY KEY,
            subject_name TEXT NOT NULL,
            semester INTEGER NOT NULL,
            credits INTEGER DEFAULT 3,
            fe_weight REAL DEFAULT 0.4,
            min_fe REAL DEFAULT 4.0
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS prerequisites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject_code TEXT NOT NULL,
            prerequisite_code TEXT NOT NULL,
            minimum_grade REAL DEFAULT 4.0
        )
    """ if not _is_postgres() else """
        CREATE TABLE IF NOT EXISTS prerequisites (
            id SERIAL PRIMARY KEY,
            subject_code TEXT NOT NULL,
            prerequisite_code TEXT NOT NULL,
            minimum_grade REAL DEFAULT 4.0
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS transcripts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT NOT NULL,
            subject_code TEXT NOT NULL,
            semester_taken INTEGER NOT NULL,
            grade REAL,
            status TEXT NOT NULL
        )
    """ if not _is_postgres() else """
        CREATE TABLE IF NOT EXISTS transcripts (
            id SERIAL PRIMARY KEY,
            student_id TEXT NOT NULL,
            subject_code TEXT NOT NULL,
            semester_taken INTEGER NOT NULL,
            grade REAL,
            status TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_schedules (
            student_id TEXT PRIMARY KEY,
            schedule_json TEXT NOT NULL,
            updated_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS student_attendances (
            student_id TEXT PRIMARY KEY,
            attendance_json TEXT NOT NULL,
            updated_at TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS policies (
            chunk_id TEXT PRIMARY KEY,
            category TEXT,
            title TEXT,
            tags_json TEXT,
            content TEXT
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS app_metadata (
            meta_key TEXT PRIMARY KEY,
            meta_json TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            student_id TEXT PRIMARY KEY,
            messages_json TEXT NOT NULL
        )
    """)

    conn.commit()

    # 2. Kiểm tra xem đã seed dữ liệu từ JSON chưa
    cur.execute("SELECT COUNT(*) FROM students")
    row = cur.fetchone()
    student_count = row[0] if row else 0

    if student_count == 0:
        _seed_from_json(conn, cur)

    conn.close()


def _read_json(filename: str, default):
    p = DATA_DIR / filename
    if p.exists():
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default
    return default


def _seed_from_json(conn, cur):
    """Đẩy toàn bộ dữ liệu từ 7 file JSON vào các bảng SQL."""
    default_pwd_hash = hash_password("123456")

    # Seed students
    students = _read_json("students.json", [])
    for s in students:
        cur.execute(
            f"INSERT INTO students (student_id, full_name, email, major, current_semester, status, password_hash) VALUES ({_ph(7)})",
            (s["student_id"], s["full_name"], s.get("email", ""), s.get("major", "Artificial Intelligence"),
             int(s.get("current_semester", 1)), s.get("status", "Studying"), default_pwd_hash)
        )

    # Seed subjects
    subjects = _read_json("subjects.json", [])
    for sub in subjects:
        cur.execute(
            f"INSERT INTO subjects (subject_code, subject_name, semester, credits, fe_weight, min_fe) VALUES ({_ph(6)})",
            (sub["subject_code"], sub["subject_name"], int(sub["semester"]),
             int(sub.get("credits", 3)), float(sub.get("fe_weight", 0.4)), float(sub.get("min_fe", 4.0)))
        )

    # Seed prerequisites
    prereqs = _read_json("prerequisites.json", [])
    for p in prereqs:
        cur.execute(
            f"INSERT INTO prerequisites (subject_code, prerequisite_code, minimum_grade) VALUES ({_ph(3)})",
            (p["subject_code"], p["prerequisite_code"], float(p.get("minimum_grade", 4.0)))
        )

    # Seed transcripts
    transcripts = _read_json("transcript.json", [])
    for r in transcripts:
        cur.execute(
            f"INSERT INTO transcripts (student_id, subject_code, semester_taken, grade, status) VALUES ({_ph(5)})",
            (r["student_id"], r["subject_code"], int(r["semester_taken"]), r.get("grade"), r["status"])
        )

    # Seed policies (FPT.json)
    fpt_data = _read_json("FPT.json", {})
    for c in fpt_data.get("chunks", []):
        cur.execute(
            f"INSERT INTO policies (chunk_id, category, title, tags_json, content) VALUES ({_ph(5)})",
            (c["chunk_id"], c.get("category", ""), c.get("title", ""),
             json.dumps(c.get("tags", []), ensure_ascii=False), c.get("content", ""))
        )

    # Seed schedules, attendances & fap_applications từ fpt_cases.json
    cases = _read_json("fpt_cases.json", {})
    for sid, sched in cases.get("schedules", {}).items():
        cur.execute(
            f"INSERT INTO student_schedules (student_id, schedule_json, updated_at) VALUES ({_ph(3)})",
            (sid, json.dumps(sched, ensure_ascii=False), "2026-10-19")
        )
    for sid, att in cases.get("attendances", {}).items():
        cur.execute(
            f"INSERT INTO student_attendances (student_id, attendance_json, updated_at) VALUES ({_ph(3)})",
            (sid, json.dumps(att, ensure_ascii=False), "2026-10-19")
        )
    if "fap_applications" in cases:
        cur.execute(
            f"INSERT INTO app_metadata (meta_key, meta_json) VALUES ({_ph(2)})",
            ("fap_applications", json.dumps(cases["fap_applications"], ensure_ascii=False))
        )

    conn.commit()


# =========================================================================
# CÁC HÀM TRUY VẤN & CẬP NHẬT DỮ LIỆU TỪ DATABASE
# =========================================================================

def fetch_all_from_db() -> dict:
    """Đọc toàn bộ dữ liệu từ Database theo đúng cấu trúc dict mà StudentAdvisor sử dụng."""
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()

    cur.execute("SELECT student_id, full_name, email, major, current_semester, status, password_hash, telegram_chat_id FROM students")
    students = {}
    for r in cur.fetchall():
        students[r[0]] = {
            "student_id": r[0],
            "full_name": r[1],
            "email": r[2],
            "major": r[3],
            "current_semester": r[4],
            "status": r[5],
            "password_hash": r[6],
            "telegram_chat_id": r[7],
        }

    cur.execute("SELECT subject_code, subject_name, semester, credits, fe_weight, min_fe FROM subjects")
    subjects = {}
    for r in cur.fetchall():
        subjects[r[0]] = {
            "subject_code": r[0],
            "subject_name": r[1],
            "semester": r[2],
            "credits": r[3],
            "fe_weight": r[4],
            "min_fe": r[5],
        }

    cur.execute("SELECT subject_code, prerequisite_code, minimum_grade FROM prerequisites")
    prereqs = {}
    for r in cur.fetchall():
        prereqs.setdefault(r[0], []).append({
            "subject_code": r[0],
            "prerequisite_code": r[1],
            "minimum_grade": r[2],
        })

    cur.execute("SELECT student_id, subject_code, semester_taken, grade, status FROM transcripts")
    transcript = [
        {"student_id": r[0], "subject_code": r[1], "semester_taken": r[2], "grade": r[3], "status": r[4]}
        for r in cur.fetchall()
    ]

    cur.execute("SELECT chunk_id, category, title, tags_json, content FROM policies")
    policy_chunks = [
        {"chunk_id": r[0], "category": r[1], "title": r[2], "tags": json.loads(r[3] or "[]"), "content": r[4]}
        for r in cur.fetchall()
    ]

    cur.execute("SELECT student_id, schedule_json FROM student_schedules")
    schedules = {r[0]: json.loads(r[1]) for r in cur.fetchall()}

    cur.execute("SELECT student_id, attendance_json FROM student_attendances")
    attendances = {r[0]: json.loads(r[1]) for r in cur.fetchall()}

    cur.execute("SELECT meta_json FROM app_metadata WHERE meta_key = 'fap_applications'")
    app_row = cur.fetchone()
    fap_applications = json.loads(app_row[0]) if app_row else {}

    conn.close()

    return {
        "students": students,
        "subjects": subjects,
        "prereqs": prereqs,
        "transcript": transcript,
        "policy": policy_chunks,
        "cases": {
            "schedules": schedules,
            "attendances": attendances,
            "fap_applications": fap_applications,
        },
        "live": {},
    }


def verify_student_credentials(identifier: str, password: str):
    """Xác thực đăng nhập bằng MSSV hoặc Email FPT từ Database."""
    init_and_seed_db()
    clean_id = identifier.strip().lower()
    raw_pwd = password.strip()

    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT student_id, password_hash FROM students WHERE LOWER(student_id) = " + _ph(1) + " OR LOWER(email) = " + _ph(1), (clean_id, clean_id))
    row = cur.fetchone()
    conn.close()

    if not row:
        return None, "Không tìm thấy thông tin sinh viên với MSSV/Email này trong Database."

    sid, stored_hash = row[0], row[1]
    input_hash = hash_password(raw_pwd)
    default_hash = hash_password("123456")

    # Nếu sinh viên chưa đổi mật khẩu (vẫn là hash mặc định 123456), cho phép đăng nhập bằng 123456 hoặc chính mã MSSV
    if input_hash == stored_hash or (stored_hash == default_hash and raw_pwd.lower() == sid.lower()):
        return sid, None

    return None, "Mật khẩu không chính xác."


def change_student_password(student_id: str, old_password: str, new_password: str):
    """Đổi mật khẩu sinh viên và lưu mã băm SHA-256 vào Database."""
    sid, err = verify_student_credentials(student_id, old_password)
    if err:
        return False, "Mật khẩu hiện tại không đúng."
    if len(new_password.strip()) < 4:
        return False, "Mật khẩu mới phải có ít nhất 4 ký tự."

    new_hash = hash_password(new_password)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("UPDATE students SET password_hash = " + _ph(1) + " WHERE student_id = " + _ph(1), (new_hash, sid))
    conn.commit()
    conn.close()
    return True, "Đã cập nhật mật khẩu mới lên Database thành công!"


def upsert_fap_sync_to_db(payload: dict) -> dict:
    """Ghi trực tiếp dữ liệu đồng bộ từ FAP Chrome Extension vào Database (bảng students, transcripts, schedules, attendances)."""
    init_and_seed_db()
    student_id = (payload.get("student_id") or "UNKNOWN").strip().upper()
    if student_id in ("UNKNOWN", "CURRENT_STUDENT", ""):
        return {"status": "skipped", "message": "Chưa nhận diện được MSSV trên trang FAP hiện tại."}

    full_name = (payload.get("full_name") or "").strip()
    synced_at = payload.get("synced_at") or ""
    transcript_records = payload.get("transcript") or []
    schedule_data = payload.get("schedule")
    attendance_data = payload.get("attendance")

    conn = get_connection()
    cur = conn.cursor()

    # 1. Đảm bảo sinh viên tồn tại trong bảng students
    cur.execute("SELECT student_id FROM students WHERE student_id = " + _ph(1), (student_id,))
    if cur.fetchone():
        if full_name:
            cur.execute("UPDATE students SET full_name = " + _ph(1) + " WHERE student_id = " + _ph(1), (full_name, student_id))
    else:
        cur.execute(
            f"INSERT INTO students (student_id, full_name, email, major, current_semester, status, password_hash) VALUES ({_ph(7)})",
            (student_id, full_name or f"Sinh viên {student_id}", f"{student_id.lower()}@fpt.edu.vn",
             "Artificial Intelligence", 5, "Studying", hash_password("123456"))
        )

    # 2. Nếu có bảng điểm từ trang Mark Report / Academic Transcript -> cập nhật vào bảng transcripts
    if transcript_records:
        cur.execute("DELETE FROM transcripts WHERE student_id = " + _ph(1), (student_id,))
        for r in transcript_records:
            cur.execute(
                f"INSERT INTO transcripts (student_id, subject_code, semester_taken, grade, status) VALUES ({_ph(5)})",
                (student_id, r["subject_code"], int(r.get("semester_taken", 1)), r.get("grade"), r.get("status", "Studying"))
            )

    # 3. Nếu có lịch học từ trang TimeTable -> cập nhật vào bảng student_schedules
    if schedule_data:
        sched_obj = schedule_data if isinstance(schedule_data, dict) else {
            "student_id": student_id,
            "full_name": full_name,
            "week": f"Đồng bộ tự động từ FAP ({synced_at[:10]})",
            "schedule": schedule_data
        }
        cur.execute("DELETE FROM student_schedules WHERE student_id = " + _ph(1), (student_id,))
        cur.execute(
            f"INSERT INTO student_schedules (student_id, schedule_json, updated_at) VALUES ({_ph(3)})",
            (student_id, json.dumps(sched_obj, ensure_ascii=False), synced_at)
        )

    # 4. Nếu có điểm danh từ trang Attendance -> cập nhật vào bảng student_attendances
    if attendance_data:
        att_obj = attendance_data[0] if isinstance(attendance_data, list) and len(attendance_data) == 1 else attendance_data
        cur.execute("DELETE FROM student_attendances WHERE student_id = " + _ph(1), (student_id,))
        cur.execute(
            f"INSERT INTO student_attendances (student_id, attendance_json, updated_at) VALUES ({_ph(3)})",
            (student_id, json.dumps(att_obj, ensure_ascii=False), synced_at)
        )

    conn.commit()
    conn.close()
    return {
        "status": "success",
        "student_id": student_id,
        "transcript_count": len(transcript_records),
        "has_schedule": bool(schedule_data),
        "has_attendance": bool(attendance_data),
    }


def load_chat_history_db(student_id: str) -> list:
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT messages_json FROM chat_history WHERE student_id = " + _ph(1), (student_id,))
    row = cur.fetchone()
    conn.close()
    if row and row[0]:
        try:
            return json.loads(row[0])
        except Exception:
            return []
    return []


def save_chat_history_db(student_id: str, messages: list):
    if not student_id:
        return
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("DELETE FROM chat_history WHERE student_id = " + _ph(1), (student_id,))
    cur.execute(
        f"INSERT INTO chat_history (student_id, messages_json) VALUES ({_ph(2)})",
        (student_id, json.dumps(messages[-40:], ensure_ascii=False))
    )
    conn.commit()
    conn.close()
