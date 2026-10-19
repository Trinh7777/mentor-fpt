"""BƯỚC 1 - Cấu hình & hằng số. Muốn chỉnh quy tắc (tín chỉ, điểm đậu, học phí...) thì sửa ở đây."""
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

# ---- Điểm số ----
PASS_GRADE = 5.0          # điểm tối thiểu để qua môn (thang 10)
ATTENDANCE_LIMIT = 0.20   # vắng quá 20% -> không được thi (theo QĐ 545)

# ---- Tín chỉ ----
# subjects.json KHÔNG có tín chỉ nên mình giả định mặc định 3 và ghi đè vài môn.
# >>> Hãy kiểm tra lại với chương trình đào tạo thật của bạn <<<
DEFAULT_CREDITS = 3
CREDIT_OVERRIDES = {
    "OJT202": 10,
    "AIP491": 10,
    "HCM202": 2,
    "VNR202": 2,
}
# Môn chỉ tính Đạt/Không đạt, không đưa vào GPA (giả định)
NON_GPA_SUBJECTS = {"OJT202"}

# ---- Học phí (FPT.json - chunk FPT_HP_02) VND / 1 tín chỉ ----
TUITION_PER_CREDIT = {
    "Hà Nội": 1_840_000,
    "TP.HCM": 1_840_000,
    "Đà Nẵng": 1_290_000,
    "Bình Định": 1_290_000,
    "Cần Thơ": 1_290_000,
}
DEFAULT_CAMPUS = "Hà Nội"

# ---- Thư viện (chunk FPT_TV_01) ----
LIBRARY_FINE_PER_DAY = 5_000
LIBRARY_COMPENSATE_AFTER_DAYS = 30

# ---- Gemini ----
DEFAULT_MODEL = "gemini-flash-lite-latest"   # Siêu nhanh (< 3s), ổn định, không bị nghẽn 503
MAX_TOOL_CALLS = 5
