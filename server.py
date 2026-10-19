"""
Local API Server nhận dữ liệu đồng bộ từ FAP Chrome Extension / Tampermonkey.
Có thể chạy độc lập (`python server.py`) hoặc tự động khởi chạy ngầm bên trong `streamlit run app.py`.
"""

import json
import math
import socket
import threading
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler

DATA_DIR = Path(__file__).parent / "data"
PORT = 8000
_SERVER_STARTED = False
_LOCK = threading.Lock()


class FAPSyncHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Giữ console gọn gàng khi chạy ngầm cùng Streamlit
        pass

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/":
            self.send_response(200)
            self._set_cors_headers()
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            resp = {"status": "ok", "service": "UniFs Chatbot FAP Receiver", "port": PORT}
            self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/api/v1/update-student-data":
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)

            try:
                payload = json.loads(body.decode("utf-8"))
                student_id = (payload.get("student_id") or "UNKNOWN").strip().upper()
                full_name = (payload.get("full_name") or "").strip()
                transcript_records = payload.get("transcript") or []
                raw_attendance = payload.get("attendance") or []

                # Chuẩn hóa điểm danh từ DOM sang cấu trúc chuẩn của Advisor nếu cần
                if raw_attendance and isinstance(raw_attendance, list) and "subject_code" not in raw_attendance[0]:
                    total_s = len(raw_attendance)
                    absent_s = sum(1 for r in raw_attendance if any("absent" in str(x).lower() or "vắng" in str(x).lower() for x in r.get("data", [])))
                    attended_s = sum(1 for r in raw_attendance if any("present" in str(x).lower() or "có mặt" in str(x).lower() for x in r.get("data", [])))
                    max_abs = math.floor(max(total_s, 20) * 0.20)
                    rem_abs = max(max_abs - absent_s, 0)
                    is_af = absent_s > max_abs
                    payload["attendance"] = [{
                        "student_id": student_id,
                        "subject_code": payload.get("current_subject") or "FAP-LIVE",
                        "subject_name": "Môn đồng bộ từ FAP",
                        "class_name": "FAP-SYNC",
                        "lecturer": "FAP Lecturer",
                        "total_slots": max(total_s, 20),
                        "current_slot": attended_s + absent_s,
                        "absent_slots": absent_s,
                        "attended_slots": attended_s,
                        "absent_rate_current": f"{round(100 * absent_s / max(attended_s + absent_s, 1), 1)}%",
                        "absent_rate_total": f"{round(100 * absent_s / max(total_s, 20), 1)}%",
                        "max_allowed_absent": max_abs,
                        "remaining_allowed_absent": rem_abs,
                        "is_attendance_fail": is_af,
                        "warning_status": "🚨 BỊ CẤM THI (AF)!" if is_af else f"✅ Đã vắng {absent_s}/{max(total_s, 20)} buổi (còn được phép vắng {rem_abs} buổi).",
                        "records": []
                    }]

                # 1. Lưu file student_live_data.json đầy đủ (gồm cả schedule, attendance)
                live_file = DATA_DIR / "student_live_data.json"
                with open(live_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)

                # 2. Cập nhật hồ sơ sinh viên vào students.json nếu có mã SV
                if student_id and student_id not in ("CURRENT_STUDENT", "UNKNOWN"):
                    students_file = DATA_DIR / "students.json"
                    students = []
                    if students_file.exists():
                        with open(students_file, encoding="utf-8") as f:
                            students = json.load(f)

                    found = False
                    for s in students:
                        if s["student_id"].upper() == student_id:
                            found = True
                            if full_name:
                                s["full_name"] = full_name
                            break

                    if not found:
                        students.append({
                            "student_id": student_id,
                            "full_name": full_name or f"Sinh viên {student_id}",
                            "email": f"{student_id.lower()}@fpt.edu.vn",
                            "major": "Artificial Intelligence",
                            "current_semester": 5,
                            "status": "Studying"
                        })

                    with open(students_file, "w", encoding="utf-8") as f:
                        json.dump(students, f, ensure_ascii=False, indent=2)

                # 3. Hợp nhất bảng điểm mới vào transcript.json
                if transcript_records and student_id not in ("CURRENT_STUDENT", "UNKNOWN"):
                    transcript_file = DATA_DIR / "transcript.json"
                    transcripts = []
                    if transcript_file.exists():
                        with open(transcript_file, encoding="utf-8") as f:
                            transcripts = json.load(f)

                    transcripts = [r for r in transcripts if r.get("student_id", "").upper() != student_id]
                    transcripts.extend(transcript_records)

                    with open(transcript_file, "w", encoding="utf-8") as f:
                        json.dump(transcripts, f, ensure_ascii=False, indent=2)

                # 4. Xóa cache của data_loader để chatbot nạp ngay dữ liệu mới
                try:
                    from data_loader import load_all
                    load_all.cache_clear()
                except Exception:
                    pass

                self.send_response(200)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()

                resp = {
                    "status": "success",
                    "message": f"Đã đồng bộ {len(transcript_records)} môn học của SV {student_id} vào Mentor FPT!",
                    "student_id": student_id,
                    "records_count": len(transcript_records)
                }
                self.wfile.write(json.dumps(resp, ensure_ascii=False).encode("utf-8"))
                print(f"[UniFs Server] ✅ Nhận thành công dữ liệu SV {student_id}: {len(transcript_records)} bản ghi.")

            except Exception as e:
                self.send_response(500)
                self._set_cors_headers()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                err_resp = {"status": "error", "message": str(e)}
                self.wfile.write(json.dumps(err_resp, ensure_ascii=False).encode("utf-8"))
                print(f"[UniFs Server] ❌ Lỗi xử lý: {e}")
        else:
            self.send_response(404)
            self.end_headers()


def is_port_in_use(port: int = PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def start_background_server() -> bool:
    """Khởi động FAP Sync Server chạy ngầm trong Daemon Thread (gọi tự động từ app.py)."""
    global _SERVER_STARTED
    with _LOCK:
        if _SERVER_STARTED or is_port_in_use(PORT):
            _SERVER_STARTED = True
            return True
        try:
            httpd = HTTPServer(("127.0.0.1", PORT), FAPSyncHandler)
            t = threading.Thread(target=httpd.serve_forever, daemon=True, name="FAPSyncServerThread")
            t.start()
            _SERVER_STARTED = True
            return True
        except Exception:
            return False


def run_server():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, FAPSyncHandler)
    print(f"🚀 UniFs Sync Server đang chạy tại: http://localhost:{PORT}")
    print(f"   API endpoint: http://localhost:{PORT}/api/v1/update-student-data")
    print("   Nhấn Ctrl + C để dừng server.")
    httpd.serve_forever()


if __name__ == "__main__":
    run_server()

