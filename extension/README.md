# 🎓 UniFs FAP Sync – Extension & Backend Sync

Giải pháp trích xuất dữ liệu học tập cá nhân (Bảng điểm, Lịch học, Điểm danh) từ FAP và đồng bộ trực tiếp vào Chatbot RAG **không bị Cloudflare chặn**.

---

## 🏗️ Kiến trúc hoạt động

```
[Trình duyệt Chrome của bạn]
      │
      ├─> Đăng nhập FAP (Google SSO / Cloudflare bình thường)
      │
      ├─> Content Script / Tampermonkey tự động chèn nút:
      │     [🎓 Đồng bộ UniFs Chatbot] ở góc phải màn hình FAP
      │
      └─> Khi bấm nút:
            Bóc tách DOM -> JSON -> POST http://localhost:8000/api/v1/update-student-data
                                                     │
                                                     ▼
                                            [server.py Backend]
                                                     │
                                                     ▼
                                            Cập nhật thẳng vào:
                                            - data/transcript.json
                                            - data/students.json
                                            - data/student_live_data.json
                                                     │
                                                     ▼
                                            [app.py Streamlit Chatbot]
                                            (Nhấn "🔄 Nạp lại data" để nhận ngay)
```

---

## 📁 Cấu trúc thư mục đã tạo

```
fpt_chatbot/
├── extension/                     # Thư mục Chrome Extension & Tampermonkey
│   ├── manifest.json              # Khai báo Chrome Extension Manifest V3
│   ├── content.js                 # Script đọc DOM bảng điểm, lịch học và gọi API
│   ├── content.css                # Style nút bấm nổi góc phải màn hình
│   ├── popup.html                 # Menu popup khi click icon extension
│   └── fap_sync.user.js           # File UserScript nếu bạn thích dùng Tampermonkey
├── server.py                      # Local API Receiver (Port 8000)
├── app.py                         # Chatbot Streamlit (Đã thêm nút "🔄 Nạp lại data")
└── ...
```

---

## 🚀 Hướng dẫn cài đặt & sử dụng

### Bước 1: Khởi động Server nhận dữ liệu Local
Mở một cửa sổ Terminal tại thư mục dự án và chạy:
```powershell
python server.py
```
*Server sẽ chạy ngầm và lắng nghe tại `http://localhost:8000/api/v1/update-student-data`.*

---

### Bước 2: Cài Extension vào Chrome (Chọn 1 trong 2 cách)

#### Cách 1: Cài Chrome Extension trực tiếp (Khuyên dùng)
1. Mở trình duyệt Chrome, truy cập vào đường dẫn: `chrome://extensions/`
2. Bật công tắc **Developer mode** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
3. Bấm nút **Load unpacked** (Tải tiện ích đã giải nén).
4. Chọn đường dẫn thư mục:  
   `d:\FPTU curi\Fall2026\DPL302m\fpt_chatbot\extension`
5. Extension **UniFs FAP Sync** sẽ xuất hiện trên thanh công cụ của Chrome.

#### Cách 2: Dùng qua Tampermonkey
Nếu bạn đã có extension Tampermonkey trên Chrome:
1. Mở Tampermonkey $\rightarrow$ **Tạo Script mới (Create a new script)**.
2. Sao chép toàn bộ nội dung file `extension/fap_sync.user.js` dán vào và nhấn **Ctrl + S** để lưu.

---

### Bước 3: Đồng bộ dữ liệu từ FAP
1. Mở Chrome, truy cập [https://fap.fpt.edu.vn/](https://fap.fpt.edu.vn/) và đăng nhập bằng email FPT bình thường (vượt Cloudflare và Google SSO 100% vì đây là Chrome bạn dùng hàng ngày).
2. Chuyển vào trang **Báo cáo điểm / Bảng điểm (Mark Report / Academic Transcript)** hoặc **Thời khóa biểu (Student TimeTable)**.
3. Ở góc dưới cùng bên phải màn hình FAP sẽ xuất hiện nút màu cam:  
   👉 **[🎓 Đồng bộ UniFs Chatbot]**
4. Bấm vào nút này. Extension sẽ:
   - Tự động trích xuất mã số sinh viên, tên, điểm từng môn và trạng thái (Passed / Failed / Studying).
   - Gửi payload về `server.py`.
   - Thông báo: `✅ Đồng bộ thành công: Đã cập nhật ... môn học của sinh viên ...`.

---

### Bước 4: Trò chuyện với Chatbot với dữ liệu mới
1. Mở giao diện Streamlit Chatbot:
   ```powershell
   streamlit run app.py
   ```
2. Ở Sidebar bên trái:
   - Bấm nút **"🔄 Nạp lại data"** để xóa cache và tải dữ liệu mới nhất vừa đồng bộ.
   - Chọn MSSV của bạn trong danh sách sinh viên.
3. Giờ đây bạn có thể hỏi Chatbot về:
   - *"GPA của mình hiện tại là bao nhiêu?"*
   - *"Mình còn nợ môn nào không?"*
   - *"Kỳ sau mình nên đăng ký môn gì?"*
