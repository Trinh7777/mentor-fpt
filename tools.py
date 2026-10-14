"""BƯỚC 5 - Đóng gói các hàm thành "tool" cho Gemini gọi (function calling).
Tool được GẮN CỨNG vào 1 sinh viên đang đăng nhập -> Gemini không thể tra điểm người khác.
Docstring + type hint chính là thứ Gemini đọc để biết khi nào gọi tool."""
import functools
from typing import Optional
from advisor import StudentAdvisor
from policy_search import search_policy as _search_policy


def _logged(fn, log):
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        result = fn(*args, **kwargs)
        log.append({"tool": fn.__name__, "args": kwargs or list(args), "result": result})
        return result
    return wrapper


def build_tools(adv: StudentAdvisor, log: list):
    def get_student_profile() -> dict:
        """Lấy thông tin hồ sơ sinh viên đang chat: họ tên, mã SV, ngành, kỳ hiện tại, trạng thái."""
        return adv.profile()

    def get_transcript(semester: Optional[int] = None) -> dict:
        """Xem bảng điểm. semester: số kỳ (1-9) nếu muốn lọc theo kỳ; bỏ trống để xem toàn bộ."""
        return adv.transcript(semester)

    def calculate_gpa(semester: Optional[int] = None) -> dict:
        """Tính GPA (thang 10, có trọng số tín chỉ). semester bỏ trống = GPA tích lũy kèm GPA từng kỳ."""
        return adv.gpa(semester)

    def plan_target_gpa(target_gpa: float) -> dict:
        """Cho GPA mục tiêu khi tốt nghiệp (vd 8.0), tính điểm trung bình cần đạt ở các tín chỉ còn lại."""
        return adv.plan_target_gpa(target_gpa)

    def get_study_progress() -> dict:
        """Tiến độ học: số tín chỉ đã qua/tổng, môn đang học, môn đang nợ cần học lại, môn chưa học."""
        return adv.progress()

    def check_prerequisites(subject_code: str) -> dict:
        """Kiểm tra môn tiên quyết của một môn (vd 'DPL302m') và xem sinh viên có đủ điều kiện đăng ký không."""
        return adv.check_prerequisites(subject_code)

    def suggest_next_subjects() -> dict:
        """Gợi ý môn nên đăng ký kỳ tới và liệt kê môn đang bị chặn do chưa đủ tiên quyết."""
        return adv.suggest_next()

    def calculate_retake_fee(subject_code: Optional[str] = None, retake_semester: Optional[int] = None) -> dict:
        """Tính học phí học lại các môn đang nợ (học lại sớm 50% / thông thường 100%).
        subject_code: chỉ tính 1 môn; retake_semester: kỳ dự định học lại (mặc định kỳ kế tiếp)."""
        return adv.retake_fee(subject_code, retake_semester)

    def check_attendance(total_slots: int, absent_slots: int) -> dict:
        """Kiểm tra nguy cơ rớt môn do vắng mặt (AF). total_slots: tổng số buổi của môn, absent_slots: số buổi đã vắng."""
        return adv.check_attendance(total_slots, absent_slots)

    def calculate_library_fine(days_late: int, book_price: float = 0) -> dict:
        """Tính tiền phạt trả sách thư viện trễ. days_late: số ngày trễ; book_price: giá sách nếu mất/trễ quá 30 ngày."""
        return adv.library_fine(days_late, book_price)

    def search_policy(query: str) -> dict:
        """Tra cứu quy chế/nội quy FPT (học phí, thi cử, kỷ luật, thôi học, bảo lưu, chuyển ngành, tốt nghiệp,
        thư viện, khen thưởng NCKH...). Truyền câu hỏi bằng tiếng Việt."""
        return {"results": _search_policy(query)}

    fns = [get_student_profile, get_transcript, calculate_gpa, plan_target_gpa, get_study_progress,
           check_prerequisites, suggest_next_subjects, calculate_retake_fee, check_attendance,
           calculate_library_fine, search_policy]
    return [_logged(f, log) for f in fns]
