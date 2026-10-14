# Mentor FPT – Chatbot học vụ (Streamlit + Gemini)

## Cấu trúc (đọc theo thứ tự này)
| # | File | Vai trò |
|---|------|---------|
| 1 | `config.py` | Hằng số: điểm đậu, tín chỉ, học phí, model |
| 2 | `data_loader.py` | Nạp 5 file JSON trong `data/` |
| 3 | `policy_search.py` | Tìm quy chế trong `FPT.json` (bỏ dấu + chấm điểm) |
| 4 | `advisor.py` | Logic: GPA, tiến độ, tiên quyết, học lại, vắng, thư viện |
| 5 | `tools.py` | Gói logic thành tool cho Gemini gọi (gắn cứng vào 1 sinh viên) |
| 6 | `fallback.py` | Chế độ không cần API key (nhận diện từ khóa) |
| 7 | `llm.py` | Gemini + function calling + persona |
| 8 | `app.py` | Giao diện Streamlit |

## Chạy
```bash
cd fpt_chatbot
python -m venv venv
venv\Scripts\activate          # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
streamlit run app.py
```

## Cấu hình Gemini API key (dành cho admin/người deploy)
Key được giữ phía server, **người dùng không thấy và không phải nhập**. Chọn 1 trong 2 cách:

1. Biến môi trường:
   ```bash
   export GEMINI_API_KEY="AIza..."      # Windows PowerShell: $env:GEMINI_API_KEY="AIza..."
   ```
2. File `.streamlit/secrets.toml` (copy từ `.streamlit/secrets.toml.example`):
   ```toml
   GEMINI_API_KEY = "AIza..."
   ```
   Khi deploy Streamlit Community Cloud: App settings → Secrets, dán nội dung trên vào.

Lấy key miễn phí tại https://aistudio.google.com/apikey. **Không commit key lên Git** (`.gitignore` đã chặn `secrets.toml` và `.env`).

Tùy chọn:
- `GEMINI_MODEL`: đổi model (mặc định trong `config.py`).
- `DEBUG=1`: hiện khung "Dữ liệu đã tra" (tên tool + JSON) để kiểm thử; mặc định ẩn.

Không có key vẫn chạy được ở chế độ từ khóa. Nếu Gemini lỗi/hết quota, app tự rơi về chế độ từ khóa và ghi lỗi vào log server.