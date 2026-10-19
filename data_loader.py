"""BƯỚC 2 - Nạp dữ liệu trực tiếp từ Cơ sở dữ liệu SQL (`database.py`: SQLite hoặc PostgreSQL/Supabase)."""
import json
from functools import lru_cache
from config import DATA_DIR
from database import fetch_all_from_db


def _read(name):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_all():
    """Đọc toàn bộ dữ liệu từ Database (tự động migrate từ JSON trong lần chạy đầu tiên)."""
    try:
        return fetch_all_from_db()
    except Exception:
        # Dự phòng đọc JSON nếu Database đang bảo trì
        students = {s["student_id"]: s for s in _read("students.json")}
        subjects = {s["subject_code"]: s for s in _read("subjects.json")}
        prereqs = {}
        for p in _read("prerequisites.json"):
            prereqs.setdefault(p["subject_code"], []).append(p)
        transcript = _read("transcript.json")
        policy_chunks = _read("FPT.json")["chunks"]
        cases_data = _read("fpt_cases.json") if (DATA_DIR / "fpt_cases.json").exists() else {}
        return {
            "students": students,
            "subjects": subjects,
            "prereqs": prereqs,
            "transcript": transcript,
            "policy": policy_chunks,
            "cases": cases_data,
            "live": {},
        }


def find_subject_code(text, subjects):
    """Tìm mã môn (không phân biệt hoa/thường) trong 1 đoạn text. Trả None nếu không có."""
    low = text.lower()
    for code in subjects:
        if code.lower() in low:
            return code
    return None
