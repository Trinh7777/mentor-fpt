"""BƯỚC 2 - Nạp 5 file JSON vào bộ nhớ (cache 1 lần)."""
import json
from functools import lru_cache
from config import DATA_DIR


def _read(name):
    with open(DATA_DIR / name, encoding="utf-8") as f:
        return json.load(f)


@lru_cache(maxsize=1)
def load_all():
    students = {s["student_id"]: s for s in _read("students.json")}
    subjects = {s["subject_code"]: s for s in _read("subjects.json")}
    prereqs = {}
    for p in _read("prerequisites.json"):
        prereqs.setdefault(p["subject_code"], []).append(p)
    transcript = _read("transcript.json")
    policy_chunks = _read("FPT.json")["chunks"]
    return {
        "students": students,
        "subjects": subjects,
        "prereqs": prereqs,
        "transcript": transcript,
        "policy": policy_chunks,
    }


def find_subject_code(text, subjects):
    """Tìm mã môn (không phân biệt hoa/thường) trong 1 đoạn text. Trả None nếu không có."""
    low = text.lower()
    for code in subjects:
        if code.lower() in low:
            return code
    return None
