"""BƯỚC 7 - Gemini: hiểu câu hỏi tự nhiên, tự gọi tool, rồi diễn đạt lại như người thật."""
from advisor import StudentAdvisor
from config import DEFAULT_MODEL, MAX_TOOL_CALLS
from tools import build_tools

SYSTEM_PROMPT = """Bạn là "Mentor FPT", trợ lý học vụ thân thiện cho sinh viên FPT University.
Đang trò chuyện với: {name} (mã {sid}), ngành {major}, học kỳ {sem}.

QUY TẮC:
- Luôn trả lời bằng tiếng Việt, giọng tự nhiên như một đàn anh/đàn chị: gần gũi, ngắn gọn, có thể dùng emoji vừa phải.
- Mọi số liệu (điểm, GPA, tín chỉ, học phí, tiến độ, tiên quyết) PHẢI lấy từ tool. Tuyệt đối không tự tính hay bịa.
- Câu hỏi về quy định/nội quy/học phí chung: gọi search_policy rồi tóm tắt, nêu tên quy định (vd QĐ 107/QĐ-CTGDFPT) nếu có.
- Nếu tool không có thông tin, nói thẳng là chưa chắc và khuyên liên hệ Phòng Dịch vụ sinh viên. Không đoán.
- Chỉ nói về dữ liệu của chính sinh viên này. Từ chối nếu hỏi điểm/thông tin người khác.
- Khi sinh viên có điểm thấp hoặc nợ môn: động viên chân thành rồi đưa bước hành động cụ thể.
- Nhớ nhắc: tín chỉ từng môn là giả định mặc định nên GPA có thể lệch nhẹ so với hệ thống chính thức khi cần.
- Tiền định dạng kiểu 5.520.000đ. Dùng markdown đơn giản (gạch đầu dòng/bảng nhỏ) khi liệt kê."""


class GeminiAgent:
    def __init__(self, api_key: str, model: str = DEFAULT_MODEL):
        from google import genai
        from google.genai import types
        self.genai, self.types = genai, types
        self.client = genai.Client(api_key=api_key)
        self.model = model

    def respond(self, history: list, user_text: str, adv: StudentAdvisor):
        """history: [{'role': 'user'|'assistant', 'content': str}, ...]  ->  (text, tool_log)"""
        t = self.types
        log = []
        s = adv.student
        config = t.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT.format(name=s["full_name"], sid=s["student_id"],
                                                    major=s["major"], sem=s["current_semester"]),
            tools=build_tools(adv, log),
            temperature=0.6,
            automatic_function_calling=t.AutomaticFunctionCallingConfig(maximum_remote_calls=MAX_TOOL_CALLS),
        )
        contents = [t.Content(role="user" if m["role"] == "user" else "model",
                              parts=[t.Part(text=m["content"])]) for m in history[-12:]]  # nhớ 12 tin gần nhất
        contents.append(t.Content(role="user", parts=[t.Part(text=user_text)]))
        resp = self.client.models.generate_content(model=self.model, contents=contents, config=config)
        return (resp.text or "Mình chưa trả lời được câu này, bạn thử diễn đạt lại nhé 🙏"), log
