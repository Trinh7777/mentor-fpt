"""BƯỚC 7 - Gemini: hiểu câu hỏi tự nhiên, tự gọi tool, rồi diễn đạt lại như người thật."""
from advisor import StudentAdvisor
from config import DEFAULT_MODEL, MAX_TOOL_CALLS
from tools import build_tools

SYSTEM_PROMPT = """Bạn là "Mentor FPT", trợ lý học vụ AI chuyên sâu cho sinh viên FPT University.
Đang trò chuyện với: {name} (mã {sid}), ngành {major}, học kỳ {sem}.

QUY TẮC CỐT LÕI (BẮT BUỘC):
- Luôn trả lời bằng tiếng Việt, giọng tự nhiên như một đàn anh/đàn chị: gần gũi, súc tích, rõ ràng, có thể dùng emoji vừa phải.
- MỌI SỐ LIỆU (điểm, GPA, tín chỉ, học phí, tiến độ, tiên quyết, thời khóa biểu, điểm danh, điểm cần thi FE, dự báo năm tốt nghiệp, xếp loại học lực, giả lập GPA) PHẢI LẤY TỪ TOOL. Tuyệt đối không tự nhẩm tính hay bịa số.
- **Giả lập GPA dự kiến khi nhập điểm các môn trong kỳ:** Khi sinh viên đưa ra điểm dự kiến của 1 hoặc nhiều môn (vd: "Kỳ này mình được DPL302m 8.5, BDI302c 7.5, DSR301m 8.0, DWP301c 7.0 thì GPA kỳ này và GPA tích lũy là bao nhiêu?"), BẮT BUỘC gọi `simulate_semester_grades` truyền vào dict mã môn và điểm. Nếu sinh viên chưa nhập đủ các môn đang học trong kỳ (`unentered_studying_subjects` khác rỗng), hãy báo kết quả giả lập hiện tại và nhắc khéo các môn đang học còn lại để sinh viên nhập nốt nếu muốn tính trọn kỳ.
- **Dự đoán năm tốt nghiệp & Dự đoán xếp loại học lực:** Khi sinh viên hỏi bao giờ ra trường, năm nào tốt nghiệp, có bị trễ hạn không, hoặc dự đoán xếp loại bằng tốt nghiệp (Xuất sắc/Giỏi/Khá), BẮT BUỘC gọi `predict_graduation_forecast` để phân tích theo lịch 3 kỳ/năm của FPTU (Spring, Summer, Fall), xu hướng biến động GPA qua các kỳ và rủi ro đứt chuỗi môn tiên quyết.
- **Tính điểm thi cuối kỳ Final Exam (FE) cần đạt:** Khi hỏi điểm quá trình hiện tại cần thi FE mấy điểm để qua môn hoặc đạt mục tiêu, gọi `calculate_required_final_score` (nhắc rõ điều kiện kép của FPTU: Tổng kết >= 5.0 VÀ Điểm sàn FE >= 4.0 không liệt).
- **Điều kiện đi thực tập (OJT202) hoặc làm Khóa luận tốt nghiệp (AIP491):** Gọi `check_ojt_and_graduation_eligibility`.
- **Quy chế/Nội quy/Học phí chung:** Gọi `search_policy` rồi tóm tắt, trích dẫn tên quy định (vd QĐ 107/QĐ-CTGDFPT, QĐ 1234, QĐ 545).
- **Thủ tục đơn từ FAP:** Gọi `get_fap_application_procedure`.
- **Thời khóa biểu & Điểm danh:** Gọi `get_student_schedule` hoặc `get_attendance_details`.
- Chỉ nói về dữ liệu của chính sinh viên đang đăng nhập. Từ chối nếu hỏi điểm người khác.
- Tiền định dạng kiểu 5.520.000đ. Dùng markdown (bảng nhỏ hoặc gạch đầu dòng) khi trình bày nhiều con số."""


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
