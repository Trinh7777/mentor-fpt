# Mentor FPT – Hệ Thống Cố Vấn Học Vụ, Tính Điểm FE & Đồng Bộ FAP (Streamlit + Gemini + Hybrid RAG)

## 🌟 Các Nâng Cấp Thực Dụng Cho Sinh Viên FPTU
1. **Tính điểm thi cuối kỳ Final Exam (FE) chuẩn quy chế FPTU:** Tính chính xác số điểm FE tối thiểu cần đạt dựa trên điểm quá trình và trọng số môn học, kiểm tra đồng thời cả 2 điều kiện: **Điểm tổng kết $\ge 5.0$** và **Điểm sàn FE $\ge 4.0$** (tránh điểm liệt thành phần).
2. **Xét điều kiện đi Thực tập doanh nghiệp (OJT202 - Kỳ 6) & Khóa luận tốt nghiệp (AIP491 - Kỳ 9):** Tự động kiểm tra điều kiện tích lũy $\ge 90\%$ tín chỉ giai đoạn Kỳ 1–5 để đi OJT và rà soát công nợ môn học trước khi làm đồ án tốt nghiệp.
3. **Sơ đồ Cây môn học 9 kỳ (Curriculum Roadmap):** Trực quan hóa toàn bộ chương trình đào tạo từ Kỳ 1 đến Kỳ 9 theo màu sắc (Đã qua, Đang học, Đang nợ, Đủ điều kiện học, Bị khóa do thiếu môn tiên quyết).
4. **Hybrid Search (BM25 + Từ điển tiếng lóng sinh viên + Gemini Vector Embedding):** Hiểu được cả ngôn ngữ đời thường của sinh viên (*"bùng học"*, *"rớt môn"*, *"quay cóp"*, *"đi trễ"*, *"hút pod"*...) lẫn ngữ nghĩa sâu để trích xuất đúng Quyết định (QĐ 107, QĐ 1234, QĐ 545, QT 07).
5. **Tự động chạy ngầm FAP Sync Server & Theo dõi Điểm danh đa môn:** Chỉ cần chạy duy nhất lệnh `streamlit run app.py`, hệ thống tự động mở cổng nhận dữ liệu trực tiếp từ Chrome Extension trên trang FAP (`port 8000`) và lưu lịch sử trò chuyện bền vững theo từng MSSV.

## 📁 Cấu trúc dự án
| # | File | Vai trò |
|---|------|---------|
| 1 | `config.py` | Hằng số: điểm đậu, tín chỉ, học phí theo cơ sở, model |
| 2 | `data_loader.py` | Nạp dữ liệu JSON trong `data/` (gồm cả `student_live_data.json` từ FAP) |
| 3 | `policy_search.py` | Hybrid RAG: BM25 + Synonym Expansion + Semantic Vector Embedding |
| 4 | `advisor.py` | Logic nghiệp vụ: GPA, điểm FE, xét OJT/KLTN, sơ đồ 9 kỳ, tiên quyết, học phí học lại, điểm danh đa môn |
| 5 | `tools.py` | Đóng gói 16 hàm nghiệp vụ thành Function Calling tools cho Gemini |
| 6 | `fallback.py` | Chế độ tra cứu trực tiếp tốc độ cao khi chưa cấu hình API key |
| 7 | `llm.py` | Gemini Agent + Streaming + Auto-Fallback Model |
| 8 | `server.py` | API Server đồng bộ dữ liệu từ FAP Chrome Extension (tự chạy ngầm cùng `app.py`) |
| 9 | `app.py` | Giao diện Dashboard 4 Tab + Chatbot cá nhân hóa |

## 🚀 Cách chạy (Chỉ cần 1 lệnh duy nhất)
```bash
cd fpt_chatbot
python -m venv venv
venv\Scripts\activate          # Windows   (macOS/Linux: source venv/bin/activate)
pip install -r requirements.txt
streamlit run app.py
```
*(Khi `app.py` khởi chạy, `FAP Sync Server` tại `http://localhost:8000` cũng tự động được bật ngầm).*

## 🔐 Đăng nhập & Tài khoản Demo kiểm thử
- **Tài khoản:** Nhập Mã số sinh viên (MSSV) hoặc Email FPT.
- **Mật khẩu mặc định:** `123456` (hoặc chính mã MSSV).
- **Các kịch bản sinh viên thực tế:**
  - `SE190456` - Nguyễn Văn A (Kỳ 5, Học lực Giỏi, **nguy cơ cấm thi môn DPL302m - chỉ còn 1 buổi nghỉ**)
  - `SE190457` - Lê Minh Hoàng (Kỳ 5, **Đã bị cấm thi AF môn BDI302c do vắng 25%**)
  - `SE190460` - Phạm Thanh Thảo (Kỳ 5, **Đang nợ môn + Bị cấm thi AF môn DSR301m**)
  - `SE190459` - Trần Anh Tuấn (Kỳ 3, **Đang nợ môn tiên quyết MAD101, PFP191**)
  - `SE190463` - Bùi Quốc Anh (Kỳ 9, **Đang làm đồ án AIP491 và chuẩn bị xét tốt nghiệp**)

## ⚙️ Cấu hình Gemini API key
1. Biến môi trường:
   ```powershell
   $env:GEMINI_API_KEY="AIza..."
   ```
2. Hoặc file `.streamlit/secrets.toml`:
   ```toml
   GEMINI_API_KEY = "AIza..."
   ```
Lấy key miễn phí tại https://aistudio.google.com/apikey.