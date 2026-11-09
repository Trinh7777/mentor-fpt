"""Tầng Cơ sở dữ liệu (Database Layer) chuẩn Doanh nghiệp:
- Mặc định: SQLite Database (`data/mentor_fpt.db`) chạy ngay lập tức không cần cài đặt.
- Cloud: PostgreSQL / Supabase / Neon nếu cấu hình `DATABASE_URL`.
- Bảo mật: Băm mật khẩu chuẩn `bcrypt` (có muối ngẫu nhiên, tương thích ngược hoàn toàn với SHA-256 cũ).
- Hỗ trợ: Khôi phục mật khẩu OTP 6 số (có hạn dùng & chống brute-force), Nhật ký bảo mật (`auth_logs`), Đa phiên hội thoại AI (`chat_threads`).
"""

import hashlib
import json
import os
import secrets
import sqlite3
import time
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path

from config import DATA_DIR, DEFAULT_CAMPUS, TUITION_PER_CREDIT

try:
    import bcrypt as _bcrypt
except ImportError:
    _bcrypt = None

DB_FILE = DATA_DIR / "mentor_fpt.db"
VN_TZ = timezone(timedelta(hours=7))


def _now_iso() -> str:
    return datetime.now(VN_TZ).strftime("%Y-%m-%d %H:%M:%S")


def _sha256(raw: str) -> str:
    return hashlib.sha256(raw.strip().encode("utf-8")).hexdigest()


def hash_password(raw_password: str) -> str:
    """Băm mật khẩu an toàn bằng thuật toán bcrypt (có salt ngẫu nhiên)."""
    clean = raw_password.strip().encode("utf-8")
    if _bcrypt is not None:
        return _bcrypt.hashpw(clean, _bcrypt.gensalt(rounds=12)).decode("utf-8")
    return _sha256(raw_password)


def verify_password(raw_password: str, stored_hash: str) -> bool:
    """Kiểm tra mật khẩu hỗ trợ cả chuẩn mới bcrypt ($2b$...) và chuẩn cũ SHA-256."""
    if not stored_hash:
        return False
    clean_str = (raw_password or "").strip()
    if stored_hash.startswith(("$2b$", "$2a$", "$2y$")):
        if _bcrypt is None:
            return False
        try:
            return _bcrypt.checkpw(clean_str.encode("utf-8"), stored_hash.encode("utf-8"))
        except Exception:
            return False
    return _sha256(clean_str) == stored_hash


def get_database_url() -> str:
    url = os.getenv("DATABASE_URL", "").strip()
    if url:
        return url
    try:
        from auth_service import get_secret
        return get_secret("DATABASE_URL", "")
    except Exception:
        return ""


def _is_postgres() -> bool:
    url = get_database_url()
    return url.startswith("postgres://") or url.startswith("postgresql://")


def get_connection():
    """Trả về connection tới PostgreSQL hoặc SQLite local (`data/mentor_fpt.db`)."""
    if _is_postgres():
        import psycopg2
        return psycopg2.connect(get_database_url())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _ph(count: int = 1) -> str:
    sym = "%s" if _is_postgres() else "?"
    return ", ".join([sym] * count)


def _ensure_column_sqlite(cur, table: str, col_name: str, col_def: str):
    cur.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cur.fetchall()}
    if col_name not in existing:
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {col_name} {col_def}")


def init_and_seed_db():
    """Tạo đầy đủ các bảng SQL, nâng cấp schema an toàn và seed dữ liệu từ JSON nếu bảng đang trống."""
    conn = get_connection()
    cur = conn.cursor()
    is_pg = _is_postgres()
    auto_pk = "SERIAL PRIMARY KEY" if is_pg else "INTEGER PRIMARY KEY AUTOINCREMENT"

    # 1. Bảng sinh viên
    cur.execute("""
        CREATE TABLE IF NOT EXISTS students (
            student_id TEXT PRIMARY KEY,
            full_name TEXT NOT NULL,
            email TEXT,
            major TEXT,
            current_semester INTEGER DEFAULT 1,
            status TEXT DEFAULT 'Studying',
            password_hash TEXT NOT NULL,
            telegram_chat_id TEXT,
            campus TEXT DEFAULT 'Hà Nội',
            updated_at TEXT
        )
    """)

    if not is_pg:
        _ensure_column_sqlite(cur, "students", "campus", "TEXT DEFAULT 'Hà Nội'")
        _ensure_column_sqlite(cur, "students", "updated_at", "TEXT")
    else:
        cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS campus TEXT DEFAULT 'Hà Nội'")
        cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TEXT")

    # 2. Các bảng học vụ cốt lõi
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

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS prerequisites (
            id {auto_pk},
            subject_code TEXT NOT NULL,
            prerequisite_code TEXT NOT NULL,
            minimum_grade REAL DEFAULT 4.0
        )
    """)

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS transcripts (
            id {auto_pk},
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
        CREATE TABLE IF NOT EXISTS student_coursework (
            student_id TEXT PRIMARY KEY,
            coursework_json TEXT NOT NULL,
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

    # 3. Các bảng Bảo mật Nâng cao & Đa phiên Chat mới
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS password_reset_otps (
            id {auto_pk},
            student_id TEXT NOT NULL,
            email TEXT NOT NULL,
            otp_hash TEXT NOT NULL,
            reset_token TEXT,
            attempts INTEGER DEFAULT 0,
            used INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )
    """)

    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS auth_logs (
            id {auto_pk},
            student_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            detail TEXT,
            ip_address TEXT,
            created_at TEXT NOT NULL
        )
    """)

    cur.execute("""
        CREATE TABLE IF NOT EXISTS chat_threads (
            thread_id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL,
            title TEXT NOT NULL,
            messages_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
    """)

    conn.commit()

    # 4. Seed dữ liệu mẫu nếu bảng students đang trống
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
    """Đẩy toàn bộ dữ liệu từ các file JSON vào các bảng SQL."""
    default_pwd_hash = hash_password("123456")
    now_str = _now_iso()

    students = _read_json("students.json", [])
    for s in students:
        cur.execute(
            f"INSERT INTO students (student_id, full_name, email, major, current_semester, status, password_hash, campus, updated_at) VALUES ({_ph(9)})",
            (
                s["student_id"],
                s["full_name"],
                s.get("email", f"{s['student_id'].lower()}@fpt.edu.vn"),
                s.get("major", "Artificial Intelligence"),
                int(s.get("current_semester", 1)),
                s.get("status", "Studying"),
                default_pwd_hash,
                DEFAULT_CAMPUS,
                now_str,
            ),
        )

    subjects = _read_json("subjects.json", [])
    for sub in subjects:
        cur.execute(
            f"INSERT INTO subjects (subject_code, subject_name, semester, credits, fe_weight, min_fe) VALUES ({_ph(6)})",
            (
                sub["subject_code"],
                sub["subject_name"],
                int(sub["semester"]),
                int(sub.get("credits", 3)),
                float(sub.get("fe_weight", 0.4)),
                float(sub.get("min_fe", 4.0)),
            ),
        )

    prereqs = _read_json("prerequisites.json", [])
    for p in prereqs:
        cur.execute(
            f"INSERT INTO prerequisites (subject_code, prerequisite_code, minimum_grade) VALUES ({_ph(3)})",
            (p["subject_code"], p["prerequisite_code"], float(p.get("minimum_grade", 4.0))),
        )

    transcripts = _read_json("transcript.json", [])
    for r in transcripts:
        cur.execute(
            f"INSERT INTO transcripts (student_id, subject_code, semester_taken, grade, status) VALUES ({_ph(5)})",
            (r["student_id"], r["subject_code"], int(r["semester_taken"]), r.get("grade"), r["status"]),
        )

    fpt_data = _read_json("FPT.json", {})
    for c in fpt_data.get("chunks", []):
        cur.execute(
            f"INSERT INTO policies (chunk_id, category, title, tags_json, content) VALUES ({_ph(5)})",
            (
                c["chunk_id"],
                c.get("category", ""),
                c.get("title", ""),
                json.dumps(c.get("tags", []), ensure_ascii=False),
                c.get("content", ""),
            ),
        )

    cases = _read_json("fpt_cases.json", {})
    for sid, sched in cases.get("schedules", {}).items():
        cur.execute(
            f"INSERT INTO student_schedules (student_id, schedule_json, updated_at) VALUES ({_ph(3)})",
            (sid, json.dumps(sched, ensure_ascii=False), "2026-10-19"),
        )
    for sid, att in cases.get("attendances", {}).items():
        cur.execute(
            f"INSERT INTO student_attendances (student_id, attendance_json, updated_at) VALUES ({_ph(3)})",
            (sid, json.dumps(att, ensure_ascii=False), "2026-10-19"),
        )
    if "fap_applications" in cases:
        cur.execute(
            f"INSERT INTO app_metadata (meta_key, meta_json) VALUES ({_ph(2)})",
            ("fap_applications", json.dumps(cases["fap_applications"], ensure_ascii=False)),
        )

    conn.commit()


# =========================================================================
# CÁC HÀM TRUY VẤN HỌC VỤ TỔNG HỢP
# =========================================================================

def fetch_all_from_db() -> dict:
    """Đọc toàn bộ dữ liệu từ Database theo đúng cấu trúc dict mà StudentAdvisor sử dụng."""
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT student_id, full_name, email, major, current_semester, status, password_hash, telegram_chat_id, campus FROM students"
    )
    students = {}
    for r in cur.fetchall():
        students[r[0]] = {
            "student_id": r[0],
            "full_name": r[1],
            "email": r[2] or f"{r[0].lower()}@fpt.edu.vn",
            "major": r[3],
            "current_semester": r[4],
            "status": r[5],
            "password_hash": r[6],
            "telegram_chat_id": r[7],
            "campus": r[8] or DEFAULT_CAMPUS,
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

    cur.execute("SELECT student_id, coursework_json FROM student_coursework")
    coursework = {r[0]: json.loads(r[1]) for r in cur.fetchall()}

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
            "coursework": coursework,
            "fap_applications": fap_applications,
        },
        "live": {},
    }


def get_student_by_id(student_id: str) -> dict | None:
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT student_id, full_name, email, major, current_semester, status, campus, updated_at, password_hash FROM students WHERE UPPER(student_id) = " + _ph(1),
        ((student_id or "").strip().upper(),),
    )
    r = cur.fetchone()
    conn.close()
    if not r:
        return None
    return {
        "student_id": r[0],
        "full_name": r[1],
        "email": r[2] or f"{r[0].lower()}@fpt.edu.vn",
        "major": r[3],
        "current_semester": r[4],
        "status": r[5],
        "campus": r[6] or DEFAULT_CAMPUS,
        "updated_at": r[7],
        "has_custom_password": not verify_password("123456", r[8]),
    }


def update_student_campus(student_id: str, campus: str) -> bool:
    if campus not in TUITION_PER_CREDIT:
        return False
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE students SET campus = " + _ph(1) + ", updated_at = " + _ph(1) + " WHERE student_id = " + _ph(1),
        (campus, _now_iso(), student_id),
    )
    conn.commit()
    conn.close()
    return True


# =========================================================================
# NHẬT KÝ BẢO MẬT & XÁC THỰC / ĐỔI MẬT KHẨU / RESET MẬT KHẨU OTP
# =========================================================================

def log_auth_event(student_id: str, event_type: str, detail: str = "", ip_address: str = ""):
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO auth_logs (student_id, event_type, detail, ip_address, created_at) VALUES ({_ph(5)})",
        (student_id, event_type, detail, ip_address or "127.0.0.1", _now_iso()),
    )
    conn.commit()
    conn.close()


def get_student_auth_logs(student_id: str, limit: int = 12) -> list[dict]:
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT event_type, detail, ip_address, created_at FROM auth_logs WHERE student_id = " + _ph(1) + " ORDER BY id DESC LIMIT " + str(int(limit)),
        (student_id,),
    )
    rows = [
        {"event_type": r[0], "detail": r[1] or "", "ip_address": r[2] or "127.0.0.1", "created_at": r[3]}
        for r in cur.fetchall()
    ]
    conn.close()
    return rows


def verify_student_credentials(identifier: str, password: str, ip_address: str = ""):
    """Xác thực đăng nhập bằng MSSV hoặc Email FPT từ Database (hỗ trợ bcrypt + SHA-256 cũ)."""
    init_and_seed_db()
    clean_id = (identifier or "").strip().lower()
    raw_pwd = (password or "").strip()

    if not clean_id or not raw_pwd:
        return None, "Vui lòng nhập đầy đủ MSSV/Email và mật khẩu."

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT student_id, password_hash FROM students WHERE LOWER(student_id) = " + _ph(1) + " OR LOWER(email) = " + _ph(1),
        (clean_id, clean_id),
    )
    row = cur.fetchone()

    if not row:
        conn.close()
        return None, "Không tìm thấy tài khoản sinh viên với MSSV hoặc Email FPT này."

    sid, stored_hash = row[0], row[1]
    is_default = verify_password("123456", stored_hash)

    matched = verify_password(raw_pwd, stored_hash) or (is_default and raw_pwd.lower() == sid.lower())
    if not matched:
        conn.close()
        return None, "Mật khẩu không chính xác. Nếu quên mật khẩu, bạn hãy bấm 'Quên mật khẩu?' để khôi phục bằng OTP."

    # Tự động nâng cấp mã băm SHA-256 cũ lên bcrypt có salt nếu người dùng đăng nhập đúng mật khẩu
    if not stored_hash.startswith(("$2b$", "$2a$", "$2y$")) and _bcrypt is not None:
        canonical_pwd = "123456" if is_default else raw_pwd
        upgraded_hash = hash_password(canonical_pwd)
        cur.execute(
            "UPDATE students SET password_hash = " + _ph(1) + " WHERE student_id = " + _ph(1),
            (upgraded_hash, sid),
        )
        conn.commit()

    conn.close()
    if ip_address:
        log_auth_event(sid, "LOGIN", "Đăng nhập thành công vào hệ thống UniFs", ip_address)
    return sid, None


def change_student_password(student_id: str, old_password: str, new_password: str, ip_address: str = ""):
    """Đổi mật khẩu sinh viên với kiểm tra độ mạnh và lưu mã băm bcrypt vào Database."""
    sid, err = verify_student_credentials(student_id, old_password)
    if err:
        return False, "Mật khẩu hiện tại không chính xác."

    clean_new = (new_password or "").strip()
    if len(clean_new) < 6:
        return False, "Mật khẩu mới phải có tối thiểu 6 ký tự để đảm bảo an toàn."

    if clean_new == (old_password or "").strip():
        return False, "Mật khẩu mới không được trùng với mật khẩu hiện tại."

    new_hash = hash_password(clean_new)
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "UPDATE students SET password_hash = " + _ph(1) + ", updated_at = " + _ph(1) + " WHERE student_id = " + _ph(1),
        (new_hash, _now_iso(), sid),
    )
    conn.commit()
    conn.close()
    log_auth_event(sid, "CHANGE_PASSWORD", "Đổi mật khẩu chủ động trong phần Cài đặt bảo mật", ip_address)
    return True, "Đã cập nhật mật khẩu mới thành công!"


def create_password_reset_otp(identifier: str, ip_address: str = "") -> tuple[dict | None, str | None]:
    """Khởi tạo mã OTP 6 số (hiệu lực 300 giây) cho quy trình Quên / Reset mật khẩu."""
    init_and_seed_db()
    clean_id = (identifier or "").strip().lower()
    if not clean_id:
        return None, "Vui lòng nhập Mã số sinh viên (MSSV) hoặc Email FPT."

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT student_id, full_name, email FROM students WHERE LOWER(student_id) = " + _ph(1) + " OR LOWER(email) = " + _ph(1),
        (clean_id, clean_id),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return None, "Không tìm thấy sinh viên nào khớp với MSSV hoặc Email FPT vừa nhập."

    sid, full_name, raw_email = row[0], row[1], row[2]
    email = raw_email or f"{sid.lower()}@fpt.edu.vn"

    # Vô hiệu hóa các mã OTP cũ chưa dùng của sinh viên này
    cur.execute(
        "UPDATE password_reset_otps SET used = 1 WHERE student_id = " + _ph(1) + " AND used = 0",
        (sid,),
    )

    otp_code = f"{secrets.randbelow(900000) + 100000}"
    otp_hash = _sha256(f"{sid}:{otp_code}")
    now_ts = int(time.time())
    expires_ts = now_ts + 300  # 5 phút

    cur.execute(
        f"INSERT INTO password_reset_otps (student_id, email, otp_hash, attempts, used, created_at, expires_at) VALUES ({_ph(7)})",
        (sid, email, otp_hash, 0, 0, now_ts, expires_ts),
    )
    conn.commit()
    conn.close()

    log_auth_event(sid, "OTP_REQUEST", f"Yêu cầu mã OTP đặt lại mật khẩu gửi tới {email}", ip_address)
    return {
        "student_id": sid,
        "full_name": full_name,
        "email": email,
        "otp_code": otp_code,
        "expires_in": 300,
    }, None


def verify_password_reset_otp(identifier: str, otp_code: str) -> tuple[str | None, str | None]:
    """Xác minh mã OTP 6 số, kiểm tra hạn 5 phút và giới hạn tối đa 5 lần nhập sai."""
    init_and_seed_db()
    clean_id = (identifier or "").strip().lower()
    clean_otp = "".join(ch for ch in (otp_code or "") if ch.isdigit())

    if len(clean_otp) != 6:
        return None, "Mã OTP phải gồm đúng 6 chữ số."

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT student_id FROM students WHERE LOWER(student_id) = " + _ph(1) + " OR LOWER(email) = " + _ph(1),
        (clean_id, clean_id),
    )
    s_row = cur.fetchone()
    if not s_row:
        conn.close()
        return None, "Không tìm thấy tài khoản sinh viên."

    sid = s_row[0]
    cur.execute(
        "SELECT id, otp_hash, attempts, expires_at FROM password_reset_otps WHERE student_id = " + _ph(1) + " AND used = 0 ORDER BY id DESC LIMIT 1",
        (sid,),
    )
    otp_row = cur.fetchone()
    if not otp_row:
        conn.close()
        return None, "Không có yêu cầu OTP nào đang hoạt động. Vui lòng bấm gửi lại mã OTP."

    otp_id, stored_otp_hash, attempts, expires_at = otp_row[0], otp_row[1], int(otp_row[2]), int(otp_row[3])
    now_ts = int(time.time())

    if now_ts > expires_at:
        cur.execute("UPDATE password_reset_otps SET used = 1 WHERE id = " + _ph(1), (otp_id,))
        conn.commit()
        conn.close()
        return None, "Mã OTP đã hết hạn (quá 5 phút). Vui lòng yêu cầu gửi lại mã mới."

    if attempts >= 5:
        cur.execute("UPDATE password_reset_otps SET used = 1 WHERE id = " + _ph(1), (otp_id,))
        conn.commit()
        conn.close()
        return None, "Bạn đã nhập sai OTP quá 5 lần. Mã này đã bị hủy vì lý do bảo mật."

    expected_hash = _sha256(f"{sid}:{clean_otp}")
    if expected_hash != stored_otp_hash:
        new_attempts = attempts + 1
        cur.execute(
            "UPDATE password_reset_otps SET attempts = " + _ph(1) + " WHERE id = " + _ph(1),
            (new_attempts, otp_id),
        )
        conn.commit()
        conn.close()
        remain = max(5 - new_attempts, 0)
        return None, f"Mã OTP không chính xác (còn {remain} lần thử)."

    reset_token = secrets.token_urlsafe(32)
    cur.execute(
        "UPDATE password_reset_otps SET reset_token = " + _ph(1) + " WHERE id = " + _ph(1),
        (reset_token, otp_id),
    )
    conn.commit()
    conn.close()
    return reset_token, None


def reset_student_password_with_token(reset_token: str, new_password: str, ip_address: str = "") -> tuple[bool, str, str | None]:
    """Đặt lại mật khẩu mới sau khi đã xác thực OTP thành công."""
    init_and_seed_db()
    clean_tok = (reset_token or "").strip()
    clean_pwd = (new_password or "").strip()

    if not clean_tok:
        return False, "Phiên đặt lại mật khẩu không hợp lệ.", None
    if len(clean_pwd) < 6:
        return False, "Mật khẩu mới phải có ít nhất 6 ký tự.", None

    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, student_id, expires_at FROM password_reset_otps WHERE reset_token = " + _ph(1) + " AND used = 0 ORDER BY id DESC LIMIT 1",
        (clean_tok,),
    )
    row = cur.fetchone()
    if not row:
        conn.close()
        return False, "Phiên khôi phục mật khẩu không tồn tại hoặc đã được sử dụng.", None

    otp_id, sid, expires_at = row[0], row[1], int(row[2])
    # Cho thêm 10 phút từ lúc tạo OTP để hoàn tất bước nhập mật khẩu mới
    if int(time.time()) > expires_at + 300:
        cur.execute("UPDATE password_reset_otps SET used = 1 WHERE id = " + _ph(1), (otp_id,))
        conn.commit()
        conn.close()
        return False, "Phiên đặt lại mật khẩu đã hết thời gian. Vui lòng thực hiện lại.", None

    new_hash = hash_password(clean_pwd)
    cur.execute(
        "UPDATE students SET password_hash = " + _ph(1) + ", updated_at = " + _ph(1) + " WHERE student_id = " + _ph(1),
        (new_hash, _now_iso(), sid),
    )
    cur.execute("UPDATE password_reset_otps SET used = 1 WHERE id = " + _ph(1), (otp_id,))
    conn.commit()
    conn.close()

    log_auth_event(sid, "RESET_PASSWORD", "Khôi phục mật khẩu mới thành công bằng mã xác thực OTP", ip_address)
    return True, "Đặt lại mật khẩu thành công! Bây giờ bạn có thể đăng nhập bằng mật khẩu mới.", sid


# =========================================================================
# ĐỒNG BỘ FAP CHROME EXTENSION & ĐA PHIÊN TRÒ CHUYỆN AI (MULTI-THREAD CHAT)
# =========================================================================

def upsert_fap_sync_to_db(payload: dict) -> dict:
    """Ghi trực tiếp dữ liệu kéo song song (Parallel Crawl) từ FAP Chrome Extension vào Database."""
    init_and_seed_db()
    student_id = (payload.get("student_id") or "UNKNOWN").strip().upper()
    if student_id in ("UNKNOWN", "CURRENT_STUDENT", ""):
        return {"status": "skipped", "message": "Chưa nhận diện được MSSV trên trang FAP hiện tại."}

    full_name = (payload.get("full_name") or "").strip()
    email = (payload.get("email") or "").strip()
    major = (payload.get("major") or "").strip()
    campus = (payload.get("campus") or "").strip()
    cur_sem_raw = payload.get("current_semester")
    synced_at = payload.get("synced_at") or _now_iso()

    transcript_records = payload.get("transcript") or []
    subjects_discovered = payload.get("subjects_discovered") or []
    schedule_data = payload.get("schedule")
    attendance_data = payload.get("attendance")
    attendances_multi = payload.get("attendances_multi") or []
    component_grades = payload.get("component_grades") or {}

    # Suy luận học kỳ hiện tại từ bảng điểm nếu FAP Profile không ghi trực tiếp
    inferred_sem = int(cur_sem_raw) if cur_sem_raw else None
    if not inferred_sem and transcript_records:
        max_term = max((int(r.get("semester_taken") or 1) for r in transcript_records), default=1)
        inferred_sem = min(max(max_term, 1), 9)

    conn = get_connection()
    cur = conn.cursor()

    # 1. Upsert sinh viên
    cur.execute(
        "SELECT full_name, email, major, current_semester, campus FROM students WHERE student_id = " + _ph(1),
        (student_id,),
    )
    existing_st = cur.fetchone()
    if existing_st:
        new_name = full_name or existing_st[0]
        new_email = email or existing_st[1] or f"{student_id.lower()}@fpt.edu.vn"
        new_major = major or existing_st[2] or "FPT University Major"
        new_sem = inferred_sem or existing_st[3] or 5
        new_campus = campus if campus in TUITION_PER_CREDIT else (existing_st[4] or DEFAULT_CAMPUS)
        cur.execute(
            "UPDATE students SET full_name = " + _ph(1) + ", email = " + _ph(1) + ", major = " + _ph(1) +
            ", current_semester = " + _ph(1) + ", campus = " + _ph(1) + ", updated_at = " + _ph(1) +
            " WHERE student_id = " + _ph(1),
            (new_name, new_email, new_major, int(new_sem), new_campus, _now_iso(), student_id),
        )
    else:
        cur.execute(
            f"INSERT INTO students (student_id, full_name, email, major, current_semester, status, password_hash, campus, updated_at) VALUES ({_ph(9)})",
            (
                student_id,
                full_name or f"Sinh viên {student_id}",
                email or f"{student_id.lower()}@fpt.edu.vn",
                major or "Software Engineering / AI",
                int(inferred_sem or 5),
                "Studying",
                hash_password("123456"),
                campus if campus in TUITION_PER_CREDIT else DEFAULT_CAMPUS,
                _now_iso(),
            ),
        )

    # 2. Tự động bổ sung các môn học mới phát hiện từ FAP (hỗ trợ mọi ngành SE, AI, IA, GD, IB...)
    merged_subjects = {}
    for r in transcript_records:
        code = (r.get("subject_code") or "").strip()
        if code:
            merged_subjects[code] = {
                "subject_code": code,
                "subject_name": (r.get("subject_name") or code).strip(),
                "semester": max(int(r.get("semester_taken") or 1), 1),
                "credits": int(r.get("credits") or 3),
                "fe_weight": float(r.get("fe_weight") if r.get("fe_weight") is not None else 0.4),
            }
    for s in subjects_discovered:
        code = (s.get("subject_code") or "").strip()
        if code:
            merged_subjects[code] = {
                "subject_code": code,
                "subject_name": (s.get("subject_name") or merged_subjects.get(code, {}).get("subject_name") or code).strip(),
                "semester": max(int(s.get("semester") or merged_subjects.get(code, {}).get("semester") or 1), 1),
                "credits": int(s.get("credits") if s.get("credits") is not None else 3),
                "fe_weight": float(s.get("fe_weight") if s.get("fe_weight") is not None else 0.4),
            }
    for code, cg in component_grades.items():
        if code in merged_subjects and cg.get("fe_weight") is not None:
            merged_subjects[code]["fe_weight"] = float(cg["fe_weight"])

    for code, s_meta in merged_subjects.items():
        cur.execute("SELECT subject_code FROM subjects WHERE subject_code = " + _ph(1), (code,))
        if not cur.fetchone():
            cur.execute(
                f"INSERT INTO subjects (subject_code, subject_name, semester, credits, fe_weight, min_fe) VALUES ({_ph(6)})",
                (
                    code,
                    s_meta["subject_name"],
                    s_meta["semester"],
                    s_meta["credits"],
                    s_meta["fe_weight"],
                    4.0,
                ),
            )
        elif cg_fe := component_grades.get(code, {}).get("fe_weight"):
            cur.execute(
                "UPDATE subjects SET fe_weight = " + _ph(1) + " WHERE subject_code = " + _ph(1),
                (float(cg_fe), code),
            )

    # 3. Cập nhật bảng điểm toàn khóa (Hỗ trợ gộp thông minh cả toàn khóa lẫn từng kỳ trên FAP 2.0 SPA)
    if transcript_records:
        cur.execute(
            "SELECT subject_code, semester_taken, grade, status FROM transcripts WHERE student_id = " + _ph(1),
            (student_id,),
        )
        existing_rows = {
            (r[0].upper(), int(r[1] or 1)): {
                "subject_code": r[0],
                "semester_taken": int(r[1] or 1),
                "grade": r[2],
                "status": r[3],
            }
            for r in cur.fetchall()
        }
        # Nếu payload gửi lên bảng điểm đầy đủ (>= số môn hiện có), ưu tiên bản mới hoàn toàn;
        # nếu gửi từng kỳ nhỏ trên FAP 2.0 SPA, gộp cộng dồn theo (mã môn, học kỳ) để không mất các kỳ trước!
        if len(transcript_records) >= len(existing_rows):
            merged_trans = list(transcript_records)
        else:
            for r in transcript_records:
                k = ((r.get("subject_code") or "").strip().upper(), int(r.get("semester_taken") or 1))
                if k[0]:
                    existing_rows[k] = {
                        "subject_code": r["subject_code"].strip(),
                        "semester_taken": int(r.get("semester_taken") or 1),
                        "grade": r.get("grade"),
                        "status": r.get("status", "Studying"),
                    }
            merged_trans = list(existing_rows.values())

        cur.execute("DELETE FROM transcripts WHERE student_id = " + _ph(1), (student_id,))
        for r in merged_trans:
            cur.execute(
                f"INSERT INTO transcripts (student_id, subject_code, semester_taken, grade, status) VALUES ({_ph(5)})",
                (student_id, r["subject_code"], int(r.get("semester_taken", 1)), r.get("grade"), r.get("status", "Studying")),
            )

    # 4. Cập nhật Thời khóa biểu tuần
    if schedule_data:
        sched_obj = schedule_data if isinstance(schedule_data, dict) else {
            "student_id": student_id,
            "full_name": full_name,
            "week": f"Đồng bộ trực tiếp từ FAP ({synced_at[:10]})",
            "schedule": schedule_data,
        }
        cur.execute("DELETE FROM student_schedules WHERE student_id = " + _ph(1), (student_id,))
        cur.execute(
            f"INSERT INTO student_schedules (student_id, schedule_json, updated_at) VALUES ({_ph(3)})",
            (student_id, json.dumps(sched_obj, ensure_ascii=False), synced_at),
        )

    # 5. Cập nhật Điểm danh đa môn (Gộp cộng dồn theo từng môn khi sinh viên lướt từng lớp trên FAP 2.0)
    if attendances_multi:
        cur.execute("SELECT attendance_json FROM student_attendances WHERE student_id = " + _ph(1), (student_id,))
        prev_att_row = cur.fetchone()
        prev_courses_map = {}
        if prev_att_row and prev_att_row[0]:
            try:
                prev_att = json.loads(prev_att_row[0])
                for pc in (prev_att.get("courses") or ([prev_att] if prev_att.get("subject_code") else [])):
                    if pc.get("subject_code"):
                        prev_courses_map[pc["subject_code"].upper()] = pc
            except Exception:
                pass
        for nc in attendances_multi:
            if nc.get("subject_code"):
                prev_courses_map[nc["subject_code"].upper()] = nc

        sorted_courses = sorted(
            list(prev_courses_map.values()),
            key=lambda c: (
                not bool(c.get("is_attendance_fail")),
                int(c.get("remaining_allowed_absent", 99)),
                -int(c.get("absent_slots", 0)),
            ),
        )
        if sorted_courses:
            primary = dict(sorted_courses[0])
            primary["courses"] = sorted_courses
            cur.execute("DELETE FROM student_attendances WHERE student_id = " + _ph(1), (student_id,))
            cur.execute(
                f"INSERT INTO student_attendances (student_id, attendance_json, updated_at) VALUES ({_ph(3)})",
                (student_id, json.dumps(primary, ensure_ascii=False), synced_at),
            )
    elif attendance_data:
        att_obj = attendance_data[0] if isinstance(attendance_data, list) and len(attendance_data) == 1 else attendance_data
        cur.execute("DELETE FROM student_attendances WHERE student_id = " + _ph(1), (student_id,))
        cur.execute(
            f"INSERT INTO student_attendances (student_id, attendance_json, updated_at) VALUES ({_ph(3)})",
            (student_id, json.dumps(att_obj, ensure_ascii=False), synced_at),
        )

    # 6. Cập nhật Điểm thành phần kỳ hiện tại (Gộp cộng dồn theo mã môn)
    if component_grades:
        cur.execute("SELECT coursework_json FROM student_coursework WHERE student_id = " + _ph(1), (student_id,))
        prev_cw_row = cur.fetchone()
        merged_cw = {}
        if prev_cw_row and prev_cw_row[0]:
            try:
                merged_cw = json.loads(prev_cw_row[0]) or {}
            except Exception:
                merged_cw = {}
        merged_cw.update(component_grades)
        cur.execute("DELETE FROM student_coursework WHERE student_id = " + _ph(1), (student_id,))
        cur.execute(
            f"INSERT INTO student_coursework (student_id, coursework_json, updated_at) VALUES ({_ph(3)})",
            (student_id, json.dumps(merged_cw, ensure_ascii=False), synced_at),
        )

    conn.commit()
    conn.close()
    log_auth_event(
        student_id,
        "FAP_SYNC",
        f"Parallel Sync FAP: {len(transcript_records)} môn điểm, {len(attendances_multi) or (1 if attendance_data else 0)} lớp điểm danh, {len(component_grades)} bảng điểm TP",
        "127.0.0.1",
    )
    return {
        "status": "success",
        "student_id": student_id,
        "transcript_count": len(transcript_records),
        "attendance_courses_count": len(attendances_multi) or (1 if attendance_data else 0),
        "component_courses_count": len(component_grades),
        "has_schedule": bool(schedule_data),
    }


def quick_auth_fap_session(student_id: str, ip_address: str = "") -> tuple[str | None, str | None]:
    """Đăng nhập nhanh bằng phiên FAP hiện tại nếu sinh viên chưa đặt mật khẩu riêng (vẫn dùng mặc định 123456).
    Nếu sinh viên đã đổi mật khẩu riêng -> yêu cầu nhập mật khẩu để đảm bảo an toàn bảo mật."""
    st = get_student_by_id(student_id)
    if not st:
        return None, "Chưa tìm thấy hồ sơ sinh viên trong Database. Hãy bấm Quét song song FAP trước!"
    if st.get("has_custom_password"):
        return None, "Tài khoản này đã thiết lập mật khẩu bảo mật riêng. Vui lòng nhập mật khẩu của bạn (hoặc Reset OTP)."
    log_auth_event(st["student_id"], "LOGIN", "Đăng nhập nhanh từ phiên FAP Extension", ip_address)
    return st["student_id"], None


def _migrate_legacy_chat_if_needed(cur, conn, student_id: str):
    """Tự động di trú lịch sử chat cũ từ bảng chat_history sang chat_threads trong lần đầu truy cập."""
    cur.execute("SELECT COUNT(*) FROM chat_threads WHERE student_id = " + _ph(1), (student_id,))
    cnt = cur.fetchone()[0]
    if cnt > 0:
        return
    cur.execute("SELECT messages_json FROM chat_history WHERE student_id = " + _ph(1), (student_id,))
    row = cur.fetchone()
    if row and row[0]:
        try:
            msgs = json.loads(row[0])
            if msgs:
                first_user = next((m.get("content", "") for m in msgs if m.get("role") == "user"), "Lịch sử tư vấn học vụ")
                title = (first_user[:42] + "...") if len(first_user) > 42 else first_user
                now = _now_iso()
                tid = f"thr_{uuid.uuid4().hex[:12]}"
                cur.execute(
                    f"INSERT INTO chat_threads (thread_id, student_id, title, messages_json, created_at, updated_at) VALUES ({_ph(6)})",
                    (tid, student_id, title, json.dumps(msgs, ensure_ascii=False), now, now),
                )
                conn.commit()
        except Exception:
            pass


def list_chat_threads(student_id: str) -> list[dict]:
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    _migrate_legacy_chat_if_needed(cur, conn, student_id)
    cur.execute(
        "SELECT thread_id, title, created_at, updated_at, messages_json FROM chat_threads WHERE student_id = " + _ph(1) + " ORDER BY updated_at DESC",
        (student_id,),
    )
    out = []
    for r in cur.fetchall():
        try:
            cnt = len(json.loads(r[4] or "[]"))
        except Exception:
            cnt = 0
        out.append({
            "thread_id": r[0],
            "title": r[1],
            "created_at": r[2],
            "updated_at": r[3],
            "message_count": cnt,
        })
    conn.close()
    return out


def create_chat_thread(student_id: str, title: str = "Cuộc trò chuyện mới") -> dict:
    init_and_seed_db()
    tid = f"thr_{uuid.uuid4().hex[:12]}"
    now = _now_iso()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        f"INSERT INTO chat_threads (thread_id, student_id, title, messages_json, created_at, updated_at) VALUES ({_ph(6)})",
        (tid, student_id, title, "[]", now, now),
    )
    conn.commit()
    conn.close()
    return {"thread_id": tid, "title": title, "created_at": now, "updated_at": now, "messages": []}


def get_chat_thread(student_id: str, thread_id: str) -> dict | None:
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT thread_id, title, messages_json, created_at, updated_at FROM chat_threads WHERE thread_id = " + _ph(1) + " AND student_id = " + _ph(1),
        (thread_id, student_id),
    )
    r = cur.fetchone()
    conn.close()
    if not r:
        return None
    try:
        msgs = json.loads(r[2] or "[]")
    except Exception:
        msgs = []
    return {
        "thread_id": r[0],
        "title": r[1],
        "messages": msgs,
        "created_at": r[3],
        "updated_at": r[4],
    }


def save_chat_thread(student_id: str, thread_id: str, messages: list, title: str | None = None) -> dict:
    init_and_seed_db()
    now = _now_iso()
    trimmed = messages[-60:]
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        "SELECT title FROM chat_threads WHERE thread_id = " + _ph(1) + " AND student_id = " + _ph(1),
        (thread_id, student_id),
    )
    row = cur.fetchone()
    if not row:
        final_title = title or "Cuộc trò chuyện mới"
        cur.execute(
            f"INSERT INTO chat_threads (thread_id, student_id, title, messages_json, created_at, updated_at) VALUES ({_ph(6)})",
            (thread_id, student_id, final_title, json.dumps(trimmed, ensure_ascii=False), now, now),
        )
    else:
        final_title = title if title else row[0]
        cur.execute(
            "UPDATE chat_threads SET title = " + _ph(1) + ", messages_json = " + _ph(1) + ", updated_at = " + _ph(1) + " WHERE thread_id = " + _ph(1) + " AND student_id = " + _ph(1),
            (final_title, json.dumps(trimmed, ensure_ascii=False), now, thread_id, student_id),
        )
    conn.commit()
    conn.close()
    return {"thread_id": thread_id, "title": final_title, "updated_at": now}


def delete_chat_thread(student_id: str, thread_id: str) -> bool:
    init_and_seed_db()
    conn = get_connection()
    cur = conn.cursor()
    cur.execute(
        "DELETE FROM chat_threads WHERE thread_id = " + _ph(1) + " AND student_id = " + _ph(1),
        (thread_id, student_id),
    )
    deleted = cur.rowcount > 0
    conn.commit()
    conn.close()
    return deleted


# Tương thích ngược với Streamlit app.py cũ
def load_chat_history_db(student_id: str) -> list:
    threads = list_chat_threads(student_id)
    if threads:
        latest = get_chat_thread(student_id, threads[0]["thread_id"])
        if latest:
            return latest["messages"]
    return []


def save_chat_history_db(student_id: str, messages: list):
    if not student_id:
        return
    threads = list_chat_threads(student_id)
    if threads:
        save_chat_thread(student_id, threads[0]["thread_id"], messages)
    else:
        t = create_chat_thread(student_id, "Trò chuyện học vụ")
        save_chat_thread(student_id, t["thread_id"], messages)
