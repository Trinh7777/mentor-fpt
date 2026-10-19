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

    def get_student_schedule() -> dict:
        """Xem thời khóa biểu chi tiết trong tuần của sinh viên (slot, thứ, môn học, lớp, phòng học, giảng viên, offline/online)."""
        return adv.get_schedule()

    def get_attendance_details(subject_code: Optional[str] = None) -> dict:
        """Xem tình hình điểm danh chi tiết từng buổi học (đã học bao nhiêu buổi, vắng mấy buổi, ngày giờ, phòng, tình trạng điểm danh, nguy cơ cấm thi AF)."""
        return adv.get_attendance_details(subject_code)

    def get_fap_application_procedure(application_name: Optional[str] = None) -> dict:
        """Tra cứu thủ tục gửi đơn từ trên FAP (xin tạm hoãn nghĩa vụ quân sự NVQS, bảo lưu, chuyển ngành, đổi combo, phúc khảo, chuyển võ sang cờ, học vượt kỳ...)."""
        return adv.get_application_procedure(application_name)

    def calculate_required_final_score(
        coursework_avg: float,
        subject_code: Optional[str] = None,
        fe_weight: Optional[float] = None,
        target_total: float = 5.0
    ) -> dict:
        """Tính điểm thi Final Exam (FE) tối thiểu cần đạt để qua môn (>= 5.0 tổng và >= 4.0 FE tránh điểm liệt) hoặc đạt điểm mục tiêu.
        coursework_avg: điểm trung bình quá trình hiện tại (thang 10, vd 6.5);
        subject_code: mã môn (vd 'DPL302m', 'BDI302c');
        fe_weight: trọng số bài thi FE (vd 0.3 hoặc 0.4, bỏ trống sẽ tự lấy theo chuẩn môn học);
        target_total: điểm tổng kết mong muốn (mặc định 5.0 để qua môn, hoặc 8.0 để đạt Giỏi)."""
        return adv.calculate_required_final_score(coursework_avg, subject_code, fe_weight, target_total)

    def check_ojt_and_graduation_eligibility() -> dict:
        """Kiểm tra xem sinh viên đã đủ điều kiện đi Thực tập doanh nghiệp (OJT202 - cần >= 90% tín chỉ kỳ 1-5)
        và đủ điều kiện làm Đồ án/Khóa luận tốt nghiệp (AIP491) hay xét tốt nghiệp chưa."""
        return adv.check_ojt_and_graduation_eligibility()

    def simulate_semester_grades(expected_grades: dict[str, float]) -> dict:
        """Giả lập GPA dự kiến (What-if GPA Simulation): khi sinh viên nhập điểm dự kiến của 1 hoặc nhiều môn trong kỳ
        (ví dụ: {'DPL302m': 8.5, 'BDI302c': 7.5, 'DSR301m': 8.0, 'DWP301c': 7.0}),
        hàm sẽ tính chính xác GPA học kỳ hiện tại, GPA tích lũy mới sau khi gộp các điểm đó, mức tăng/giảm GPA và xếp loại học lực mới."""
        return adv.simulate_semester_grades(expected_grades)

    def predict_graduation_forecast() -> dict:
        """Dự báo thời điểm tốt nghiệp (tháng/năm ra trường, học kỳ kết thúc theo lịch 3 kỳ/năm của FPTU),
        dự đoán xếp loại học lực khi tốt nghiệp dựa trên xu hướng điểm (Linear Regression trend),
        ngưỡng điểm cần đạt cho bằng Xuất sắc/Giỏi/Khá và rủi ro trễ hạn tốt nghiệp do nợ môn tiên quyết."""
        return adv.predict_graduation_forecast()

    fns = [get_student_profile, get_transcript, calculate_gpa, plan_target_gpa, get_study_progress,
           check_prerequisites, suggest_next_subjects, calculate_retake_fee, check_attendance,
           calculate_library_fine, search_policy, get_student_schedule, get_attendance_details,
           get_fap_application_procedure, calculate_required_final_score, check_ojt_and_graduation_eligibility,
           simulate_semester_grades, predict_graduation_forecast]
    return [_logged(f, log) for f in fns]
