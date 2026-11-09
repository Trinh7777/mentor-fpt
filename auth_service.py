"""Dịch vụ Xác thực, Bảo mật Token, Kiểm tra Độ mạnh Mật khẩu & Gửi Email OTP (SMTP / Demo Mode)."""

import os
import re
import smtplib
import tomllib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired

ROOT_DIR = Path(__file__).parent
SECRETS_TOML = ROOT_DIR / ".streamlit" / "secrets.toml"
ENV_FILE = ROOT_DIR / ".env"

# Nạp biến môi trường từ .env nếu có
try:
    from dotenv import load_dotenv
    if ENV_FILE.exists():
        load_dotenv(ENV_FILE)
except Exception:
    pass


def get_secret(key: str, default: str = "") -> str:
    """Đọc cấu hình ưu tiên từ biến môi trường (.env / OS env), sau đó tới .streamlit/secrets.toml."""
    val = os.getenv(key, "").strip()
    if val:
        return val
    if SECRETS_TOML.exists():
        try:
            data = tomllib.loads(SECRETS_TOML.read_text(encoding="utf-8"))
            raw = str(data.get(key, "")).strip()
            if raw and raw != "AIza...":
                return raw
        except Exception:
            pass
    return default


def _get_serializer() -> URLSafeTimedSerializer:
    secret_key = get_secret("AUTH_SECRET_KEY", "unifs-fpt-vip-pro-secret-2026-dpl302m")
    return URLSafeTimedSerializer(secret_key, salt="unifs-session-v2")


def create_session_token(student_id: str, campus: str = "Hà Nội", remember_me: bool = True) -> str:
    """Tạo Signed Bearer Token bền vững cho phiên đăng nhập."""
    s = _get_serializer()
    return s.dumps({
        "sid": student_id,
        "campus": campus,
        "rem": bool(remember_me),
    })


def verify_session_token(token: str) -> dict | None:
    """Giải mã và xác thực chữ ký + thời hạn của Bearer Token."""
    if not token:
        return None
    s = _get_serializer()
    try:
        # Cho phép tối đa 30 ngày nếu remember_me, kiểm tra chi tiết bên dưới
        payload = s.loads(token, max_age=30 * 24 * 3600)
        if not payload.get("rem"):
            # Nếu không tích Remember Me thì giới hạn 24 giờ
            payload = s.loads(token, max_age=24 * 3600)
        return payload
    except (BadSignature, SignatureExpired, Exception):
        return None


def validate_password_strength(password: str) -> tuple[bool, str, dict]:
    """Kiểm tra tiêu chuẩn bảo mật của mật khẩu mới."""
    pwd = (password or "").strip()
    checks = {
        "min_length": len(pwd) >= 6,
        "has_letter": bool(re.search(r"[A-Za-z]", pwd)),
        "has_number": bool(re.search(r"\d", pwd)),
        "has_upper_and_lower": bool(re.search(r"[a-z]", pwd) and re.search(r"[A-Z]", pwd)),
        "has_special": bool(re.search(r"[^A-Za-z0-9]", pwd)),
    }
    score = sum([
        checks["min_length"],
        checks["has_letter"] and checks["has_number"],
        checks["has_upper_and_lower"],
        checks["has_special"] or len(pwd) >= 10,
    ])

    if not checks["min_length"]:
        return False, "Mật khẩu mới phải có tối thiểu 6 ký tự.", {"score": score, "checks": checks}

    return True, "Mật khẩu hợp lệ.", {"score": score, "checks": checks}


def mask_email(email: str) -> str:
    """Che một phần địa chỉ email để hiển thị an toàn (VD: se19***56@fpt.edu.vn)."""
    if not email or "@" not in email:
        return "email đã đăng ký"
    local, domain = email.split("@", 1)
    if len(local) <= 4:
        masked_local = local[0] + "***"
    else:
        masked_local = f"{local[:3]}***{local[-2:]}"
    return f"{masked_local}@{domain}"


def is_smtp_configured() -> bool:
    smtp_email = get_secret("SMTP_EMAIL")
    smtp_pass = get_secret("SMTP_APP_PASSWORD")
    return bool(smtp_email and smtp_pass)


def send_otp_email(to_email: str, full_name: str, student_id: str, otp_code: str) -> dict:
    """Gửi mã OTP 6 số qua Gmail SMTP nếu đã cấu hình.
    Nếu chưa cấu hình SMTP, tự động chuyển sang Chế độ Demo OTP trực quan để phục vụ kiểm thử/bảo vệ đồ án."""
    smtp_email = get_secret("SMTP_EMAIL")
    smtp_pass = get_secret("SMTP_APP_PASSWORD")
    smtp_host = get_secret("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(get_secret("SMTP_PORT", "587") or "587")

    if not smtp_email or not smtp_pass or not to_email:
        return {
            "sent_via_smtp": False,
            "delivery_mode": "demo",
            "message": "Hệ thống đang chạy ở Chế độ Demo Bảo vệ Đồ án (chưa cấu hình SMTP). Mã OTP xác thực được hiển thị trực tiếp bên dưới.",
        }

    html_body = f"""
    <div style="font-family:'Segoe UI',Inter,Arial,sans-serif;max-width:540px;margin:0 auto;background:#0f172a;color:#f8fafc;border-radius:18px;overflow:hidden;border:1px solid #1e293b;">
        <div style="height:6px;background:linear-gradient(90deg,#0066b2 0%,#f37021 50%,#0db14b 100%);"></div>
        <div style="padding:28px 32px;">
            <div style="font-size:22px;font-weight:800;margin-bottom:6px;">
                <span style="color:#38bdf8;">Uni</span><span style="color:#f37021;">F</span><span style="color:#0db14b;">s</span> Pro · FPT University
            </div>
            <p style="color:#94a3b8;font-size:14px;margin-top:0;">Yêu cầu đặt lại mật khẩu tài khoản sinh viên</p>
            <p style="font-size:15px;line-height:1.6;color:#e2e8f0;">
                Xin chào <b>{full_name}</b> (<code>{student_id}</code>),<br>
                Chúng tôi nhận được yêu cầu khôi phục mật khẩu cho tài khoản học vụ UniFs của bạn. Vui lòng nhập mã OTP gồm 6 chữ số dưới đây:
            </p>
            <div style="margin:24px 0;padding:18px;background:#1e293b;border:1px dashed #38bdf8;border-radius:14px;text-align:center;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:2px;color:#94a3b8;margin-bottom:6px;">Mã xác thực OTP (Hiệu lực 5 phút)</div>
                <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:#f8fafc;font-family:monospace;">{otp_code}</div>
            </div>
            <p style="font-size:13px;color:#94a3b8;line-height:1.5;">
                ⚠️ Tuyệt đối không chia sẻ mã này cho người khác. Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email này — tài khoản của bạn vẫn an toàn.
            </p>
        </div>
    </div>
    """

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"[{otp_code}] Mã xác thực đặt lại mật khẩu UniFs - FPT University"
        msg["From"] = f"UniFs FPT Security <{smtp_email}>"
        msg["To"] = to_email
        msg.attach(MIMEText(f"Mã OTP khôi phục mật khẩu UniFs của {full_name} ({student_id}) là: {otp_code} (hiệu lực 5 phút).", "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            server.starttls()
            server.login(smtp_email, smtp_pass)
            server.sendmail(smtp_email, [to_email], msg.as_string())

        return {
            "sent_via_smtp": True,
            "delivery_mode": "smtp",
            "message": f"Đã gửi mã OTP 6 số tới hộp thư {mask_email(to_email)}. Vui lòng kiểm tra Inbox/Spam.",
        }
    except Exception as exc:
        return {
            "sent_via_smtp": False,
            "delivery_mode": "demo",
            "smtp_error": str(exc),
            "message": f"Không thể kết nối máy chủ SMTP ({exc}). Đã chuyển tự động sang Chế độ Demo OTP trực tiếp.",
        }
