# 🧩 UniFs Pro — FAP Parallel Crawler & In-Page AI Copilot (Chrome Extension V3)

Extension chạy trực tiếp trên **`https://fap.fpt.edu.vn/*`** (và cổng giả lập kiểm thử **`http://localhost:8000/fap-simulator/*`**), tự động **kéo song song 5 luồng dữ liệu học vụ** trong nền bằng `Promise.allSettled` rồi mở **Ngăn kéo AI Copilot** ngay trên trang FAP để sinh viên phân tích & hỏi đáp tức thì!

---

## ⚡ Cơ chế Kéo Dữ Liệu Song Song (5-Stream Parallel Crawler)

Ngay khi mở bất kỳ trang nào trên `fap.fpt.edu.vn`, `fap_crawler.js` tận dụng phiên đăng nhập hiện tại (`credentials: "include"`) để quét đồng thời:
1. **Luồng 1 — Hồ sơ & Cơ sở (`/User/Profile.aspx`):** MSSV, Họ tên, Email FPT, Ngành học, Học kỳ hiện tại, Campus.
2. **Luồng 2 — Bảng điểm toàn khóa (`/Grade/StudentTranscript.aspx`):** Toàn bộ các môn đã qua (`Passed`), đang học (`Studying`), đang nợ (`Not passed` -> `Failed`) và tự động khám phá mã môn mới cho mọi ngành (`AI`, `SE`, `IA`, `GD`, `IB`...).
3. **Luồng 3 — Điểm thành phần kỳ hiện tại (`/Grade/StudentGrade.aspx`):** Tự động phát hiện danh sách tất cả các lớp trong kỳ và **kéo song song bảng Mark Report từng môn** (`PT1`, `PT2`, `Lab`, `Assignment`, trọng số `Final Exam`), tính sẵn điểm `FE` cần đạt để **Qua môn (`>= 5.0`)** và **Đạt Giỏi (`>= 8.0`)**.
4. **Luồng 4 — Thời khóa biểu tuần (`/Report/ScheduleOfWeek.aspx`):** Ma trận lịch học theo từng Slot, phòng học, giảng viên, trạng thái điểm danh.
5. **Luồng 5 — Điểm danh đa môn (`/Report/ViewAttendStudent.aspx`):** Quét song song tất cả các môn đang học trong kỳ, đếm số buổi vắng / tổng số slot và cảnh báo sớm ngưỡng **20% cấm thi (`AF`)**.

---

## 🚀 Cách Cài Đặt Extension Lên Chrome / Edge / Brave (30 giây)

1. Khởi chạy Backend AI Server ở thư mục gốc dự án:
   ```bash
   python run.py
   ```
2. Mở trình duyệt Chrome / Microsoft Edge / Cốc Cốc / Brave và truy cập:
   - Chrome: `chrome://extensions/`
   - Edge: `edge://extensions/`
3. Bật công tắc **Developer mode (Chế độ dành cho nhà phát triển)** ở góc trên bên phải.
4. Nhấn **Load unpacked (Tải tiện ích đã giải nén)** → Trỏ vào thư mục **`extension/`** trong dự án này.
5. Truy cập **`https://fap.fpt.edu.vn`** (hoặc trang giả lập chuẩn DOM FAP tại **`http://localhost:8000/fap-simulator/Student.aspx`** để test ngay không cần mạng ngoài!).
6. Bấm vào nút nổi **🤖 UniFs AI Copilot** ở góc dưới bên phải (hoặc nhấn phím tắt **`Alt + U`**) để mở Ngăn kéo AI ngay trên FAP!
