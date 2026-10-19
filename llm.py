"""BƯỚC 7 - Gemini: hiểu câu hỏi tự nhiên, tự gọi tool, rồi diễn đạt lại như người thật."""
from advisor import StudentAdvisor
from config import DEFAULT_MODEL, MAX_TOOL_CALLS
from tools import build_tools

SYSTEM_PROMPT = """Bạn là "Mentor FPT", trợ lý học vụ thân thiện cho sinh viên FPT University.
Đang trò chuyện với: {name} (mã {sid}), ngành {major}, học kỳ {sem}.

QUY TẮC:
- Luôn trả lời bằng tiếng Việt, giọng tự nhiên như một đàn anh/đàn chị: gần gũi, ngắn gọn, có thể dùng emoji vừa phải.
- Mọi số liệu (điểm, GPA, tín chỉ, học phí, tiến độ, tiên quyết, thời khóa biểu, điểm danh, điểm cần thi FE, điều kiện OJT/KLTN) PHẢI lấy từ tool. Tuyệt đối không tự tính hay bịa.
- Câu hỏi về tính điểm thi cuối kỳ Final Exam (FE) để qua môn hoặc đạt mục tiêu (vd: "điểm quá trình 6.5 thì FE cần mấy điểm"): gọi calculate_required_final_score, lưu ý nhắc điều kiện sàn FE >= 4.0 và tổng kết >= 5.0 của FPTU.
- Câu hỏi về điều kiện đi thực tập doanh nghiệp (OJT / OJT202) hoặc làm Đồ án/Khóa luận tốt nghiệp (KLTN / AIP491) / xét tốt nghiệp của cá nhân sinh viên: gọi check_ojt_and_graduation_eligibility kết hợp search_policy nếu cần giải thích quy chế.
- Câu hỏi về quy định/nội quy/học phí chung: gọi search_policy rồi tóm tắt, nêu tên quy định (vd QĐ 107/QĐ-CTGDFPT) nếu có.
- Câu hỏi về thủ tục làm đơn trên FAP (xin tạm hoãn nghĩa vụ quân sự NVQS, bảo lưu, chuyển ngành, đổi combo, chuyển võ sang cờ...): gọi get_fap_application_procedure để hướng dẫn sinh viên các bước (lên FAP nộp đơn, chờ duyệt, lên phòng Dịch vụ sinh viên nhận giấy tờ).
- Câu hỏi về thời khóa biểu (lịch học tuần này, hôm nay học gì, slot mấy, phòng nào): gọi get_student_schedule và trình bày rõ ràng, dễ nhìn.
- Câu hỏi về điểm danh môn học (đã nghỉ bao nhiêu buổi, nguy cơ cấm thi AF): gọi get_attendance_details để cảnh báo cụ thể số buổi vắng và số buổi còn lại được phép nghỉ.
- Nếu tool không có thông tin, nói thẳng là chưa chắc và khuyên liên hệ Phòng Dịch vụ sinh viên. Không đoán.
- Chỉ nói về dữ liệu của chính sinh viên này. Từ chối nếu hỏi điểm/thông tin người khác.
- Khi sinh viên có điểm thấp hoặc nợ môn: động viên chân thành rồi đưa bước hành động cụ thể.
- Tiền định dạng kiểu 5.520.000đ. Dùng markdown đơn giản (gạch đầu dòng/bảng nhỏ) khi liệt kê."""


class GeminiAgent:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        from google import genai
        from google.genai import types
        self.genai, self.types = genai, types
        # Thiết lập timeout 12 giây để không bao giờ bị treo quay mãi mãi
        self.client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=12000))
        self.model = model

    def respond(self, history: list, user_text: str, adv: StudentAdvisor):
        """history: [{'role': 'user'|'assistant', 'content': str}, ...]  ->  (text, tool_log)"""
        t = self.types
        s = adv.student
        
        # Danh sách model dự phòng tự động nếu một model bị quá tải (503) hoặc hết quota (429)
        candidates = [self.model]
        for fallback_m in ["gemini-flash-lite-latest", "gemini-flash-latest"]:
            if fallback_m not in candidates:
                candidates.append(fallback_m)

        # Chuẩn hóa lịch sử: gộp các tin liên tiếp cùng role để không vi phạm quy tắc luân phiên user/model của Gemini
        cleaned_contents = []
        for m in history[-12:]:
            role = "user" if m.get("role") == "user" else "model"
            text = m.get("content", "").strip()
            if not text:
                continue
            if cleaned_contents and cleaned_contents[-1].role == role:
                cleaned_contents[-1].parts.append(t.Part(text=f"\n{text}"))
            else:
                cleaned_contents.append(t.Content(role=role, parts=[t.Part(text=text)]))

        if cleaned_contents and cleaned_contents[-1].role == "user":
            cleaned_contents[-1].parts.append(t.Part(text=f"\n{user_text}"))
        else:
            cleaned_contents.append(t.Content(role="user", parts=[t.Part(text=user_text)]))

        last_err = None
        for current_model in candidates:
            log = []
            try:
                config = t.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT.format(name=s["full_name"], sid=s["student_id"],
                                                            major=s["major"], sem=s["current_semester"]),
                    tools=build_tools(adv, log),
                    temperature=0.6,
                    automatic_function_calling=t.AutomaticFunctionCallingConfig(maximum_remote_calls=MAX_TOOL_CALLS),
                )
                resp = self.client.models.generate_content(model=current_model, contents=cleaned_contents, config=config)
                return (resp.text or "Mình chưa trả lời được câu này, bạn thử diễn đạt lại nhé 🙏"), log
            except Exception as e:
                last_err = e
                continue
        
        # Nếu thử tất cả model đều lỗi thì mới ném exception ra ngoài cho app.py fallback
        raise last_err

    def respond_stream(self, history: list, user_text: str, adv: StudentAdvisor):
        """Phản hồi theo dạng Streaming thời gian thực: trả về (generator_chuỗi, tool_log)"""
        t = self.types
        s = adv.student
        
        candidates = [self.model]
        for fallback_m in ["gemini-flash-lite-latest", "gemini-flash-latest"]:
            if fallback_m not in candidates:
                candidates.append(fallback_m)

        cleaned_contents = []
        for m in history[-12:]:
            role = "user" if m.get("role") == "user" else "model"
            text = m.get("content", "").strip()
            if not text:
                continue
            if cleaned_contents and cleaned_contents[-1].role == role:
                cleaned_contents[-1].parts.append(t.Part(text=f"\n{text}"))
            else:
                cleaned_contents.append(t.Content(role=role, parts=[t.Part(text=text)]))

        if cleaned_contents and cleaned_contents[-1].role == "user":
            cleaned_contents[-1].parts.append(t.Part(text=f"\n{user_text}"))
        else:
            cleaned_contents.append(t.Content(role="user", parts=[t.Part(text=user_text)]))

        last_err = None
        for current_model in candidates:
            log = []
            try:
                config = t.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT.format(name=s["full_name"], sid=s["student_id"],
                                                            major=s["major"], sem=s["current_semester"]),
                    tools=build_tools(adv, log),
                    temperature=0.6,
                    automatic_function_calling=t.AutomaticFunctionCallingConfig(maximum_remote_calls=MAX_TOOL_CALLS),
                )
                stream = self.client.models.generate_content_stream(model=current_model, contents=cleaned_contents, config=config)
                
                def text_generator():
                    has_content = False
                    for chunk in stream:
                        txt = chunk.text
                        if txt:
                            has_content = True
                            yield txt
                    if not has_content:
                        yield "Mình chưa trả lời được câu này, bạn thử diễn đạt lại nhé 🙏"

                return text_generator(), log
            except Exception as e:
                last_err = e
                continue
        
        raise last_err
