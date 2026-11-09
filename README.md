# ✨ UniFs Pro 2.0 — Hệ Sinh Thái Cố Vấn Học Vụ AI & Dashboard 360° (FPT University)

Nền tảng Web App Full-Stack hiện đại (**FastAPI + React 19 + Tailwind CSS + Gemini Function Calling + Hybrid RAG + SQL Database**) dành riêng cho sinh viên Đại học FPT.

---

## 🌟 Điểm Nhấn "Siêu Cấp VIP Pro" Phiên Bản 2.0

1. **🎨 Giao diện Web SPA Hiện Đại (Dark / Light Glassmorphism):**
   - Tốc độ phản hồi tức thì, không bị giật hay reload toàn trang như Streamlit truyền thống.
   - Thiết kế chuẩn nhận diện 3 sắc màu đặc trưng FPT University (`#0066B2` – `#F37021` – `#0DB14B`).
2. **🛡️ Hệ Thống Xác Thực, Đổi Mật Khẩu & Reset Mật Khẩu OTP 6 Số:**
   - **Đăng nhập thông minh:** Hỗ trợ MSSV hoặc Email FPT, lưu phiên bền vững 30 ngày (`Signed Bearer Token`), kèm khay **1-Click Demo Personas** để kiểm thử nhanh khi bảo vệ đồ án.
   - **Mã hóa chuẩn `bcrypt` có muối (Salted Hash):** Tự động nâng cấp toàn bộ mật khẩu SHA-256 cũ lên chuẩn bảo mật `bcrypt`.
   - **Đổi mật khẩu trực quan:** Tích hợp **Thanh đo độ mạnh mật khẩu 4 cấp độ** theo thời gian thực và **Nhật ký bảo mật (`auth_logs`)**.
   - **Quên / Reset mật khẩu bằng OTP 6 số (3 bước):** Hỗ trợ gửi email HTML thật qua **Gmail SMTP** (khi cấu hình `SMTP_EMAIL` & `SMTP_APP_PASSWORD`), đồng thời tự động bật **"Hộp thư OTP Trực quan (Demo Mode)"** có đếm ngược 5 phút & nút điền nhanh khi chấm bài offline.
3. **📊 Dashboard Học Vụ 360° Trực Quan:**
   - 4 thẻ KPI tổng hợp: **GPA Tích lũy**, **Vòng tròn Tiến độ Tín chỉ**, **Theo dõi Chuyên cần**, **Dự báo Tốt nghiệp AI**.
   - **Biểu đồ vùng biến động GPA** qua từng học kỳ kèm đường dự phóng xếp loại bằng khi ra trường.
   - **Ma trận 20 Slot Điểm danh & Thanh cảnh báo đỏ cấm thi AF (20%)**, **Thời khóa biểu tuần FAP**, và **Bảng điểm lọc đa chiều**.
4. **🗺️ Sơ Đồ Cây Môn Học 9 Kỳ & Bộ Công Cụ Tương Tác:**
   - Trực quan hóa toàn bộ 9 học kỳ theo trạng thái (*Đã qua, Đang học, Đang nợ, Đủ điều kiện, Bị khóa tiên quyết*).
   - **Máy tính Điểm thi Final Exam (FE)** và **Thanh trượt Giả lập GPA Học kỳ (What-If Simulation)** cập nhật điểm tức thì.
5. **🤖 AI Chat Studio Đa Phiên & Real-Time SSE Streaming:**
   - Quản lý nhiều cuộc trò chuyện độc lập, streaming từng từ mượt mà, hiển thị rõ **danh sách công cụ học vụ (`Tool Calls`)** đã truy vấn để đảm bảo 0% ảo giác số liệu.
6. **🧩 FAP Chrome Extension V3 — Kéo Song Song 5 Luồng & Trợ Lý AI Ngay Trên FAP (`extension/`):**
   - Nhúng trực tiếp nút nổi 3D & **Ngăn kéo AI Copilot (`Alt + U`)** ngay bên trên giao diện `https://fap.fpt.edu.vn/*`.
   - Tự động **quét song song 5 luồng dữ liệu học vụ** (`Hồ sơ`, `Bảng điểm toàn khóa`, `Bảng điểm thành phần PT/Lab/Assignment`, `Thời khóa biểu tuần`, `Điểm danh đa môn 20% AF`) về SQLite và cho phép hỏi đáp, tính điểm FE, giả lập GPA ngay trong FAP!
   - Đi kèm cổng giả lập chuẩn cấu trúc DOM FAP tại **`http://localhost:8000/fap-simulator/Student.aspx`** để kiểm thử & demo Extension mọi lúc mà không cần mạng ngoài.

---

## 🚀 Cách Chạy Nhanh (Chỉ 1 Lệnh Duy Nhất)

### Cách 1: Click đúp file `start.bat` (Windows) hoặc chạy Python
```powershell
.\venv\Scripts\python.exe run.py
```
Hệ thống sẽ tự động khởi động cả Backend + Frontend Web App và mở trình duyệt tại:
👉 **http://localhost:8000**

*(Hoặc chạy `.\venv\Scripts\python.exe server.py`)*

---

## 🔐 Tài Khoản Sinh Viên Mẫu Để Kiểm Thử
- **Mật khẩu mặc định:** `123456` *(nếu tài khoản đã đổi mật khẩu riêng, bạn có thể bấm **"Reset mật khẩu OTP"** ngay trên màn hình đăng nhập để đặt lại trong 5 giây!)*
- `SE190456` – **Nguyễn Văn A** (Kỳ 5, Học lực Giỏi, nguy cơ cấm thi `DPL302m` – chỉ còn 1 buổi nghỉ)
- `SE190457` – **Lê Minh Hoàng** (Kỳ 5, **Đã bị cấm thi AF môn `BDI302c`** do vắng 25%)
- `SE190460` – **Phạm Thanh Thảo** (Kỳ 5, **Đang nợ môn + Cấm thi AF môn `DSR301m`**)
- `SE190459` – **Trần Anh Tuấn** (Kỳ 3, **Đang nợ môn tiên quyết `MAD101`, `PFP191`**)
- `SE190463` – **Bùi Quốc Anh** (Kỳ 9, **Đang làm khóa luận `AIP491` & xét tốt nghiệp**)

---

## ⚙️ Cấu Hình Môi Trường (`.env` hoặc `.streamlit/secrets.toml`)
Xem mẫu chi tiết trong file `.env.example`:
- `GEMINI_API_KEY`: API Key Google Gemini (hệ thống tự động nhận từ `.env` hoặc `.streamlit/secrets.toml`).
- `SMTP_EMAIL` & `SMTP_APP_PASSWORD`: *(Tùy chọn)* Cấu hình Gmail App Password nếu muốn gửi mã OTP 6 số thật qua email. Nếu để trống, hệ thống tự động dùng **Chế độ Demo OTP trực tiếp trên giao diện**.
- `DATABASE_URL`: *(Tùy chọn)* PostgreSQL/Supabase URL (mặc định dùng SQLite tại `data/mentor_fpt.db`).

---

## 🛠️ Phát Triển Giao Diện Frontend (`frontend/`)
Nếu muốn chỉnh sửa giao diện React + Tailwind CSS:
```powershell
cd frontend
npm install
npm run dev        # Chạy chế độ Hot-Reload tại http://localhost:5173
npm run build:all  # Build đồng thời Web SPA (../static/) và Chrome Extension UI (../extension/)
```

---

## 🧩 Cài Đặt Chrome Extension Chạy Trực Tiếp Trên `fap.fpt.edu.vn`
1. Chạy server Python: `.\venv\Scripts\python.exe run.py`
2. Mở `chrome://extensions/` (hoặc `edge://extensions/`) → Bật **Developer mode**.
3. Bấm **Load unpacked (Tải tiện ích đã giải nén)** → Chọn thư mục `extension/`.
4. Mở **`https://fap.fpt.edu.vn`** (hoặc cổng giả lập **`http://localhost:8000/fap-simulator/Student.aspx`**) → Nhấn nút nổi **UniFs AI Copilot** (hoặc `Alt + U`) để trải nghiệm!
