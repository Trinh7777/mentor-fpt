"""
FAP Academic Portal Realistic Simulator (/fap-simulator/*)
Mô phỏng chuẩn cấu trúc DOM ASP.NET của https://fap.fpt.edu.vn để test trực tiếp
Chrome Extension Parallel Crawler + In-Page AI Copilot ngay trên môi trường Local/Demo
mà không cần mạng ngoài hay cookie SSO hết hạn.
"""

from html import escape
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from config import CREDIT_OVERRIDES, DEFAULT_CREDITS
from data_loader import load_all

router = APIRouter(prefix="/fap-simulator", tags=["FAP Simulator"])

# Thêm 1 sinh viên mẫu hoàn toàn mới chưa từng có trong JSON gốc để chứng minh khả năng Auto-Discovery từ FAP!
EXTRA_DEMO_STUDENT = {
    "student_id": "SE190888",
    "full_name": "Lê Hoàng Bảo Ngọc",
    "email": "ngoclhbse190888@fpt.edu.vn",
    "major": "Software Engineering",
    "current_semester": 5,
    "campus": "TP.HCM",
    "transcript": [
        {"semester_taken": 1, "subject_code": "PRF192", "subject_name": "Programming Fundamentals", "credits": 3, "grade": 8.6, "status": "Passed"},
        {"semester_taken": 1, "subject_code": "MAE101", "subject_name": "Mathematics for Engineering", "credits": 3, "grade": 8.2, "status": "Passed"},
        {"semester_taken": 1, "subject_code": "CEA201", "subject_name": "Computer Organization and Architecture", "credits": 3, "grade": 7.9, "status": "Passed"},
        {"semester_taken": 2, "subject_code": "PRO192", "subject_name": "Object-Oriented Programming", "credits": 3, "grade": 8.5, "status": "Passed"},
        {"semester_taken": 2, "subject_code": "MAD101", "subject_name": "Discrete Mathematics", "credits": 3, "grade": 8.0, "status": "Passed"},
        {"semester_taken": 3, "subject_code": "CSD201", "subject_name": "Data Structures and Algorithms", "credits": 3, "grade": 8.4, "status": "Passed"},
        {"semester_taken": 3, "subject_code": "DBI202", "subject_name": "Introduction to Databases", "credits": 3, "grade": 8.8, "status": "Passed"},
        {"semester_taken": 4, "subject_code": "PRJ301", "subject_name": "Java Web Application Development", "credits": 3, "grade": 8.1, "status": "Passed"},
        {"semester_taken": 4, "subject_code": "SWE201c", "subject_name": "Introduction to Software Engineering", "credits": 3, "grade": 8.7, "status": "Passed"},
        {"semester_taken": 5, "subject_code": "SWP391", "subject_name": "Application Development Project", "credits": 3, "grade": None, "status": "Studying"},
        {"semester_taken": 5, "subject_code": "SWR302", "subject_name": "Software Requirement", "credits": 3, "grade": None, "status": "Studying"},
        {"semester_taken": 5, "subject_code": "SWT301", "subject_name": "Software Testing", "credits": 3, "grade": None, "status": "Studying"},
        {"semester_taken": 5, "subject_code": "PRN212", "subject_name": "Basis Cross-Platform Application Programming With .NET", "credits": 3, "grade": None, "status": "Studying"},
    ],
}


def _resolve_sid(request: Request, sid: Optional[str]) -> str:
    chosen = (sid or request.cookies.get("fap_sim_sid") or "SE190457").strip().upper()
    return chosen


def _get_sim_student_bundle(sid: str) -> dict:
    d = load_all()
    if sid == EXTRA_DEMO_STUDENT["student_id"]:
        st = EXTRA_DEMO_STUDENT
        studying = [r for r in st["transcript"] if r["status"] == "Studying"]
        return {
            "student_id": st["student_id"],
            "full_name": st["full_name"],
            "email": st["email"],
            "major": st["major"],
            "current_semester": st["current_semester"],
            "campus": st["campus"],
            "transcript": st["transcript"],
            "studying": studying,
        }

    if sid not in d["students"]:
        sid = "SE190457" if "SE190457" in d["students"] else next(iter(d["students"].keys()))

    st = d["students"][sid]
    subjects = d["subjects"]
    recs = [r for r in d["transcript"] if r["student_id"] == sid]
    enriched_recs = []
    for r in sorted(recs, key=lambda x: (x["semester_taken"], x["subject_code"])):
        code = r["subject_code"]
        s_meta = subjects.get(code, {})
        enriched_recs.append({
            "semester_taken": r["semester_taken"],
            "subject_code": code,
            "subject_name": s_meta.get("subject_name", code),
            "credits": s_meta.get("credits", CREDIT_OVERRIDES.get(code, DEFAULT_CREDITS)),
            "fe_weight": s_meta.get("fe_weight", 0.4),
            "grade": r["grade"],
            "status": r["status"],
        })

    studying = [r for r in enriched_recs if r["status"] == "Studying"]
    if not studying:
        # Nếu sinh viên kỳ cuối ít môn đang học, lấy các môn kỳ hiện tại
        studying = [r for r in enriched_recs if r["semester_taken"] == st["current_semester"]][:4]

    return {
        "student_id": st["student_id"],
        "full_name": st["full_name"],
        "email": st.get("email") or f"{sid.lower()}@fpt.edu.vn",
        "major": st.get("major", "Artificial Intelligence"),
        "current_semester": st.get("current_semester", 5),
        "campus": st.get("campus", "Hà Nội"),
        "transcript": enriched_recs,
        "studying": studying,
    }


def _generate_component_items(sid: str, course: dict, idx: int) -> list[dict]:
    """Sinh bảng điểm thành phần chuẩn FAP Mark Report cho từng môn đang học."""
    code = course["subject_code"]
    fe_w = int(round(float(course.get("fe_weight", 0.4)) * 100))
    if fe_w <= 0:
        return [
            {"category": "Iteration 1", "item": "Iteration 1", "weight": "30.0 %", "value": "8.2", "comment": "Good progress"},
            {"category": "Iteration 2", "item": "Iteration 2", "weight": "30.0 %", "value": "8.5", "comment": ""},
            {"category": "Final Evaluation", "item": "Final Presentation", "weight": "40.0 %", "value": "", "comment": "Upcoming"},
        ]

    rem = 100 - fe_w
    w_pt1 = 10
    w_pt2 = 10
    w_lab = 20 if rem >= 60 else 15
    w_ass = max(rem - w_pt1 - w_pt2 - w_lab, 10)

    # Tạo mức điểm quá trình đa dạng theo từng sinh viên & từng môn để phân tích FE siêu thực tế
    seed = (sum(ord(ch) for ch in (sid + code)) + idx * 7) % 35
    base = round(5.4 + (seed / 10.0), 1)  # từ 5.4 -> 8.8
    pt1 = min(round(base + 0.4, 1), 9.8)
    pt2 = max(round(base - 0.6, 1), 4.2)
    lab = min(round(base + 0.7, 1), 9.6)
    ass = round(base, 1)

    return [
        {"category": "Progress Test", "item": "Progress Test 1", "weight": f"{w_pt1}.0 %", "value": str(pt1), "comment": ""},
        {"category": "Progress Test", "item": "Progress Test 2", "weight": f"{w_pt2}.0 %", "value": str(pt2), "comment": ""},
        {"category": "Lab", "item": "Lab Average", "weight": f"{w_lab}.0 %", "value": str(lab), "comment": "Submitted on LMS"},
        {"category": "Assignment", "item": "Assignment", "weight": f"{w_ass}.0 %", "value": str(ass), "comment": ""},
        {"category": "Final Exam", "item": "Final Exam", "weight": f"{fe_w}.0 %", "value": "", "comment": "Not yet taken"},
        {"category": "Final Exam Resit", "item": "Final Exam Resit", "weight": f"{fe_w}.0 %", "value": "", "comment": ""},
    ]


def _generate_multi_attendance(sid: str, bundle: dict) -> dict[str, dict]:
    """Sinh bảng điểm danh chi tiết từng slot cho TẤT CẢ các môn đang học trong kỳ."""
    d = load_all()
    existing_att = d.get("cases", {}).get("attendances", {}).get(sid, {})
    courses_out = {}

    rooms = ["BE-301", "AL-R204", "DE-212", "BE-405"]
    lecturers = ["PhuongTD", "HuyNQ12", "TuanVM3", "LinhNTT8"]

    for idx, c in enumerate(bundle["studying"]):
        code = c["subject_code"]
        total_slots = 20
        current_slot = 15

        # Quyết định số buổi vắng chân thực cho từng persona
        if existing_att and existing_att.get("subject_code") == code and not existing_att.get("courses"):
            absent_count = int(existing_att.get("absent_slots", 2))
        elif sid == "SE190457":
            absent_count = [5, 3, 1, 0][idx % 4]  # Môn 1 bị AF (5/20), Môn 2 sát nút (3/20)!
        elif sid == "SE190456":
            absent_count = [3, 2, 0, 1][idx % 4]  # Môn 1 sát nút 3/20 (còn 1 buổi)
        elif sid == "SE190460":
            absent_count = [5, 4, 1, 2][idx % 4]  # 1 môn AF, 1 môn chạm trần 4/20
        elif sid == "SE190888":
            absent_count = [3, 1, 0, 2][idx % 4]
        else:
            absent_count = [1, 0, 2, 0][idx % 4]

        absent_indices = set()
        for a_i in range(absent_count):
            slot_no = min(2 + a_i * 3, current_slot)
            while slot_no in absent_indices and slot_no < current_slot:
                slot_no += 1
            absent_indices.add(slot_no)

        rows = []
        for s_no in range(1, total_slots + 1):
            day = ((s_no * 3 + idx) % 28) + 1
            month = 9 if s_no <= 8 else (10 if s_no <= 16 else 11)
            date_str = f"{day:02d}/{month:02d}/2026"
            if s_no > current_slot:
                st_label = "Future"
            elif s_no in absent_indices:
                st_label = "Absent"
            else:
                st_label = "Present"
            rows.append({
                "no": s_no,
                "date": date_str,
                "slot": f"Slot {(idx % 4) + 1}_(07:30-09:50)" if idx % 2 == 0 else f"Slot {(idx % 4) + 1}_(12:50-15:10)",
                "room": rooms[idx % len(rooms)],
                "lecturer": lecturers[idx % len(lecturers)],
                "group": f"AI190{idx + 1}" if "AI" in bundle["major"] or "Artificial" in bundle["major"] else f"SE190{idx + 1}",
                "status": st_label,
                "comment": "Vắng không phép" if st_label == "Absent" else "",
            })

        courses_out[code] = {
            "subject_code": code,
            "subject_name": c["subject_name"],
            "group": f"AI190{idx + 1}" if "Artificial" in bundle["major"] else f"SE190{idx + 1}",
            "room": rooms[idx % len(rooms)],
            "lecturer": lecturers[idx % len(lecturers)],
            "rows": rows,
        }
    return courses_out


def _fap_layout(bundle: dict, active_title: str, body_html: str) -> str:
    sid = bundle["student_id"]
    campus_map = {
        "Hà Nội": "FPTU-Hòa Lạc",
        "TP.HCM": "FPTU-Hồ Chí Minh",
        "Đà Nẵng": "FPTU-Đà Nẵng",
        "Cần Thơ": "FPTU-Cần Thơ",
        "Quy Nhơn": "FPTU-Quy Nhơn",
    }
    fap_campus = campus_map.get(bundle["campus"], "FPTU-Hòa Lạc")

    personas = [
        ("SE190457", "SE190457 - Bị cấm thi AF + Điểm TP"),
        ("SE190456", "SE190456 - Sát ngưỡng AF (3/20)"),
        ("SE190460", "SE190460 - Nợ môn + Tính phí học lại"),
        ("SE190463", "SE190463 - Kỳ 9 Khóa luận tốt nghiệp"),
        ("SE190888", "SE190888 - SV ngành SE mới (Auto-Discovery)"),
    ]
    options_html = "".join(
        f'<option value="{p_id}" {"selected" if p_id == sid else ""}>{escape(p_label)}</option>'
        for p_id, p_label in personas
    )

    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FPT University Academic Portal - {escape(active_title)}</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      margin: 0;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 13px;
      color: #333;
      background: #f4f6f9;
    }}
    .fap-sim-banner {{
      background: linear-gradient(90deg, #0f172a, #1e293b);
      color: #f8fafc;
      padding: 8px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 2px solid #f37021;
      font-size: 12px;
    }}
    .fap-sim-banner select {{
      background: #0f172a;
      color: #fb923c;
      border: 1px solid #475569;
      border-radius: 6px;
      padding: 4px 8px;
      font-weight: 600;
      cursor: pointer;
    }}
    .container {{
      max-width: 1160px;
      margin: 16px auto 60px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
      padding: 18px 24px 32px;
    }}
    .fap-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 3px solid #f37021;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }}
    .fap-logo {{
      font-size: 22px;
      font-weight: 800;
      color: #f37021;
      letter-spacing: -0.3px;
    }}
    .fap-logo small {{
      display: block;
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
    }}
    .fap-user-bar {{
      text-align: right;
      font-size: 12px;
    }}
    .label-success {{
      background: #16a34a;
      color: #fff;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 700;
    }}
    .label-campus {{
      background: #f37021;
      color: #fff;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 700;
      margin-left: 6px;
    }}
    .fap-nav {{
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      padding: 8px 12px;
      border-radius: 4px;
      margin-bottom: 18px;
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
    }}
    .fap-nav a {{
      color: #1d4ed8;
      text-decoration: none;
      font-weight: 600;
    }}
    .fap-nav a:hover {{ text-decoration: underline; color: #f37021; }}
    h2.page-title {{
      margin: 0 0 14px;
      font-size: 18px;
      color: #1e293b;
      font-weight: 700;
    }}
    table.table {{
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      font-size: 12.5px;
    }}
    table.table th {{
      background: #6b90da;
      color: #fff;
      text-align: left;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      font-weight: 700;
    }}
    table.table td {{
      padding: 7px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }}
    table.table tr:nth-child(even) td {{ background: #f8fafc; }}
    .text-success {{ color: #15803d; font-weight: 700; }}
    .text-danger {{ color: #dc2626; font-weight: 700; }}
    .text-warning {{ color: #d97706; font-weight: 700; }}
    .grid-2 {{
      display: grid;
      grid-template-columns: 280px 1fr;
      gap: 18px;
    }}
    .course-list a {{
      display: block;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      border-radius: 4px;
      margin-bottom: 6px;
      color: #1d4ed8;
      text-decoration: none;
      font-weight: 600;
    }}
    .course-list a.active {{
      background: #fff7ed;
      border-color: #f37021;
      color: #c2410c;
    }}
    .portal-boxes {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 14px;
    }}
    .portal-box {{
      border: 1px solid #cbd5e1;
      border-top: 3px solid #f37021;
      border-radius: 4px;
      padding: 14px;
      background: #fff;
    }}
    .portal-box h3 {{ margin: 0 0 10px; color: #f37021; font-size: 14px; }}
    .portal-box ul {{ margin: 0; padding-left: 18px; line-height: 1.85; }}
    .portal-box a {{ color: #1d4ed8; text-decoration: none; }}
    .portal-box a:hover {{ text-decoration: underline; }}
  </style>
</head>
<body>
  <div class="fap-sim-banner">
    <div>
      🧪 <strong>FAP Portal Live Testbed</strong> — Cấu trúc DOM chuẩn <code>fap.fpt.edu.vn</code> để kiểm thử trực tiếp <strong>UniFs Chrome Extension (Parallel Crawler + In-Page AI Copilot)</strong>
    </div>
    <div>
      Đổi sinh viên đang đăng nhập FAP:
      <select onchange="window.location.href = window.location.pathname + '?sid=' + this.value">
        {options_html}
      </select>
    </div>
  </div>

  <div class="container">
    <div class="fap-header">
      <div class="fap-logo">
        FPT University Academic Portal
        <small>Information System — Powered by FAP ASP.NET Structure</small>
      </div>
      <div class="fap-user-bar">
        <span id="ctl00_lblLogIn" class="label-success">{escape(bundle['full_name'])} ({escape(sid)})</span>
        <span id="ctl00_lblCampusName" class="label-campus">CAMPUS: {escape(fap_campus)}</span>
      </div>
    </div>

    <div class="fap-nav">
      <a href="/fap-simulator/Student.aspx?sid={sid}">🏠 Home</a>
      <a href="/fap-simulator/User/Profile.aspx?sid={sid}">👤 Student Profile</a>
      <a href="/fap-simulator/Report/ScheduleOfWeek.aspx?sid={sid}">📅 Weekly Timetable</a>
      <a href="/fap-simulator/Report/ViewAttendStudent.aspx?sid={sid}">📋 View Attendance</a>
      <a href="/fap-simulator/Grade/StudentGrade.aspx?sid={sid}">📊 Mark Report (Điểm TP)</a>
      <a href="/fap-simulator/Grade/StudentTranscript.aspx?sid={sid}">🎓 Academic Transcript</a>
    </div>

    <h2 class="page-title">{escape(active_title)}</h2>
    {body_html}
  </div>
</body>
</html>"""


def _html_with_cookie(html: str, sid: str) -> HTMLResponse:
    resp = HTMLResponse(content=html)
    resp.set_cookie("fap_sim_sid", sid, max_age=86400 * 7, path="/")
    return resp


@router.get("")
@router.get("/")
def fap_sim_root(sid: Optional[str] = Query(None)):
    q = f"?sid={sid}" if sid else ""
    return RedirectResponse(url=f"/fap-simulator/Student.aspx{q}")


@router.get("/Student.aspx")
def fap_sim_home(request: Request, sid: Optional[str] = Query(None)):
    resolved = _resolve_sid(request, sid)
    bundle = _get_sim_student_bundle(resolved)
    body = f"""
    <div class="portal-boxes">
      <div class="portal-box">
        <h3>Information Access (Tra cứu thông tin)</h3>
        <ul>
          <li><a href="/fap-simulator/Report/ScheduleOfWeek.aspx?sid={resolved}">Weekly timetable</a> (Thời khóa biểu từng tuần)</li>
          <li><a href="/fap-simulator/Report/ViewAttendStudent.aspx?sid={resolved}">View attendance</a> (Báo cáo điểm danh các môn kỳ Fall 2026)</li>
          <li><a href="/fap-simulator/User/Profile.aspx?sid={resolved}">Student Profile</a> (Hồ sơ sinh viên: {escape(bundle['major'])})</li>
        </ul>
      </div>
      <div class="portal-box">
        <h3>Reports &amp; Grades (Báo cáo điểm)</h3>
        <ul>
          <li><a href="/fap-simulator/Grade/StudentGrade.aspx?sid={resolved}">Mark Report</a> (Điểm thành phần PT, Lab, Assignment kỳ hiện tại)</li>
          <li><a href="/fap-simulator/Grade/StudentTranscript.aspx?sid={resolved}">Academic Transcript</a> (Bảng điểm tích lũy toàn khóa)</li>
          <li>Current Term: <strong>Fall 2026 (Term {bundle['current_semester']})</strong> — {len(bundle['studying'])} courses enrolled</li>
        </ul>
      </div>
    </div>
    """
    return _html_with_cookie(_fap_layout(bundle, "Academic Portal — Student Home", body), bundle["student_id"])


@router.get("/User/Profile.aspx")
def fap_sim_profile(request: Request, sid: Optional[str] = Query(None)):
    resolved = _resolve_sid(request, sid)
    bundle = _get_sim_student_bundle(resolved)
    body = f"""
    <div id="ctl00_mainContent_divProfile">
      <table class="table">
        <tbody>
          <tr><th style="width:240px">Roll number</th><td>{escape(bundle['student_id'])}</td></tr>
          <tr><th>Full name</th><td>{escape(bundle['full_name'])}</td></tr>
          <tr><th>Email</th><td>{escape(bundle['email'])}</td></tr>
          <tr><th>Major</th><td>{escape(bundle['major'])}</td></tr>
          <tr><th>Current term</th><td>{bundle['current_semester']}</td></tr>
          <tr><th>Status</th><td>HD (Studying)</td></tr>
          <tr><th>Campus</th><td>{escape(bundle['campus'])}</td></tr>
        </tbody>
      </table>
    </div>
    """
    return _html_with_cookie(_fap_layout(bundle, "Student Profile", body), bundle["student_id"])


@router.get("/Grade/StudentTranscript.aspx")
def fap_sim_transcript(request: Request, sid: Optional[str] = Query(None)):
    resolved = _resolve_sid(request, sid)
    bundle = _get_sim_student_bundle(resolved)
    rows_html = []
    for idx, r in enumerate(bundle["transcript"], start=1):
        st = r["status"]
        fap_status = "Not passed" if st == "Failed" else st
        cls = "text-success" if st == "Passed" else ("text-danger" if st == "Failed" else "text-warning")
        grade_str = "" if r["grade"] is None else f"{r['grade']}"
        sem_name = f"Term{r['semester_taken']}"
        rows_html.append(
            f"<tr>"
            f"<td>{idx}</td>"
            f"<td>{r['semester_taken']}</td>"
            f"<td>{sem_name}</td>"
            f"<td>{escape(r['subject_code'])}</td>"
            f"<td></td>"
            f"<td></td>"
            f"<td>{escape(r['subject_name'])}</td>"
            f"<td>{r['credits']}</td>"
            f"<td>{grade_str}</td>"
            f"<td class='{cls}'>{fap_status}</td>"
            f"</tr>"
        )

    body = f"""
    <div id="ctl00_mainContent_divGrade">
      <table class="table table-bordered">
        <thead>
          <tr>
            <th>No</th><th>Term</th><th>Semester</th><th>Subject Code</th>
            <th>Prerequisite</th><th>Replaced Subject</th><th>Subject Name</th>
            <th>Credit</th><th>Grade</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {''.join(rows_html)}
        </tbody>
      </table>
    </div>
    """
    return _html_with_cookie(_fap_layout(bundle, f"Academic Transcript — {bundle['full_name']} ({bundle['student_id']})", body), bundle["student_id"])


@router.get("/Grade/StudentGrade.aspx")
def fap_sim_mark_report(
    request: Request,
    sid: Optional[str] = Query(None),
    course: Optional[str] = Query(None),
):
    resolved = _resolve_sid(request, sid)
    bundle = _get_sim_student_bundle(resolved)
    studying = bundle["studying"]
    selected = studying[0] if studying else None
    selected_idx = 0
    if course and studying:
        for i, c in enumerate(studying):
            if c["subject_code"].lower() == course.strip().lower():
                selected = c
                selected_idx = i
                break

    links_html = "".join(
        f'<a class="{"active" if selected and c["subject_code"] == selected["subject_code"] else ""}" '
        f'href="/fap-simulator/Grade/StudentGrade.aspx?sid={bundle["student_id"]}&course={c["subject_code"]}">'
        f'{escape(c["subject_name"])} ({escape(c["subject_code"])})</a>'
        for c in studying
    )

    grade_rows = ""
    if selected:
        items = _generate_component_items(bundle["student_id"], selected, selected_idx)
        grade_rows = "".join(
            f"<tr>"
            f"<td>{escape(it['category'])}</td>"
            f"<td>{escape(it['item'])}</td>"
            f"<td>{escape(it['weight'])}</td>"
            f"<td>{escape(it['value'])}</td>"
            f"<td>{escape(it['comment'])}</td>"
            f"</tr>"
            for it in items
        )

    body = f"""
    <div class="grid-2">
      <div id="ctl00_mainContent_divCourse" class="course-list">
        <div style="font-weight:700;margin-bottom:8px;">Term: Fall2026</div>
        {links_html or '<div>No active courses</div>'}
      </div>
      <div id="ctl00_mainContent_divGrade">
        <div style="font-weight:700;margin-bottom:8px;">
          {escape(selected['subject_name'] + ' (' + selected['subject_code'] + ')') if selected else 'Select a course'}
        </div>
        <table class="table table-bordered">
          <thead>
            <tr>
              <th>Grade category</th><th>Grade item</th><th>Weight</th><th>Value</th><th>Comment</th>
            </tr>
          </thead>
          <tbody>
            {grade_rows}
          </tbody>
        </table>
      </div>
    </div>
    """
    return _html_with_cookie(_fap_layout(bundle, "Mark Report (Bảng điểm thành phần kỳ Fall 2026)", body), bundle["student_id"])


@router.get("/Report/ScheduleOfWeek.aspx")
def fap_sim_schedule(request: Request, sid: Optional[str] = Query(None)):
    resolved = _resolve_sid(request, sid)
    bundle = _get_sim_student_bundle(resolved)
    d = load_all()
    existing_sched = d.get("cases", {}).get("schedules", {}).get(bundle["student_id"])

    days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]
    day_map_vi = {
        "Thứ 2": "MON", "Thứ 3": "TUE", "Thứ 4": "WED",
        "Thứ 5": "THU", "Thứ 6": "FRI", "Thứ 7": "SAT", "Chủ nhật": "SUN",
    }

    slots_matrix = {
        1: {"time": "07:30-09:50", "cells": {k: "-" for k in days}},
        2: {"time": "10:00-12:20", "cells": {k: "-" for k in days}},
        3: {"time": "12:50-15:10", "cells": {k: "-" for k in days}},
        4: {"time": "15:20-17:40", "cells": {k: "-" for k in days}},
    }

    if existing_sched and existing_sched.get("schedule"):
        for s_item in existing_sched["schedule"]:
            s_num = int(s_item.get("slot", 1))
            if s_num in slots_matrix:
                slots_matrix[s_num]["time"] = s_item.get("time", slots_matrix[s_num]["time"])
                for vi_day, info in (s_item.get("days") or {}).items():
                    en_day = day_map_vi.get(vi_day)
                    if en_day and info:
                        slots_matrix[s_num]["cells"][en_day] = (
                            f"<strong>{escape(info['subject_code'])}</strong> at {escape(info.get('room', 'BE-301'))}<br/>"
                            f"({escape(info.get('status', 'attended'))}) - Class {escape(info.get('class_name', 'AI1901'))} - GV: {escape(info.get('lecturer', 'FPT'))}"
                        )
    else:
        for idx, c in enumerate(bundle["studying"][:4]):
            s_num = (idx % 4) + 1
            d1 = days[(idx * 2) % 6]
            d2 = days[(idx * 2 + 2) % 6]
            cell_html = (
                f"<strong>{escape(c['subject_code'])}</strong> at BE-30{idx + 1}<br/>"
                f"(attended) - Class SE190{idx + 1} - GV: PhuongTD"
            )
            slots_matrix[s_num]["cells"][d1] = cell_html
            slots_matrix[s_num]["cells"][d2] = cell_html

    rows_html = []
    for s_num, s_info in slots_matrix.items():
        tds = "".join(f"<td>{s_info['cells'][k]}</td>" for k in days)
        rows_html.append(f"<tr><td><strong>Slot {s_num}</strong><br/><small>({s_info['time']})</small></td>{tds}</tr>")

    body = f"""
    <table id="ctl00_mainContent_gvSchedule" class="table table-bordered">
      <thead>
        <tr>
          <th>Slot</th>
          {''.join(f'<th>{k}</th>' for k in days)}
        </tr>
      </thead>
      <tbody>
        {''.join(rows_html)}
      </tbody>
    </table>
    """
    return _html_with_cookie(_fap_layout(bundle, "Activities for Student (Weekly Timetable)", body), bundle["student_id"])


@router.get("/Report/ViewAttendStudent.aspx")
def fap_sim_attendance(
    request: Request,
    sid: Optional[str] = Query(None),
    course: Optional[str] = Query(None),
):
    resolved = _resolve_sid(request, sid)
    bundle = _get_sim_student_bundle(resolved)
    att_map = _generate_multi_attendance(bundle["student_id"], bundle)

    selected_code = next(iter(att_map.keys()), None)
    if course:
        for k in att_map:
            if k.lower() == course.strip().lower():
                selected_code = k
                break

    selected = att_map.get(selected_code) if selected_code else None
    links_html = "".join(
        f'<a class="{"active" if k == selected_code else ""}" '
        f'href="/fap-simulator/Report/ViewAttendStudent.aspx?sid={bundle["student_id"]}&course={k}">'
        f'{escape(v["subject_name"])} ({escape(k)}) ({escape(v["group"])})</a>'
        for k, v in att_map.items()
    )

    detail_rows = ""
    summary_footer = ""
    if selected:
        abs_cnt = sum(1 for r in selected["rows"] if r["status"] == "Absent")
        tot_cnt = len(selected["rows"])
        pct = round(100 * abs_cnt / max(tot_cnt, 1), 1)
        for r in selected["rows"]:
            cls = "text-success" if r["status"] == "Present" else ("text-danger" if r["status"] == "Absent" else "")
            detail_rows += (
                f"<tr>"
                f"<td>{r['no']}</td>"
                f"<td>{r['date']}</td>"
                f"<td>{escape(r['slot'])}</td>"
                f"<td>{escape(r['room'])}</td>"
                f"<td>{escape(r['lecturer'])}</td>"
                f"<td>{escape(r['group'])}</td>"
                f"<td class='{cls}'>{r['status']}</td>"
                f"<td>{escape(r['comment'])}</td>"
                f"</tr>"
            )
        summary_footer = f"<div style='font-weight:700;margin-top:8px;'>ABSENT: {pct}% ABSENT SO FAR ({abs_cnt} ABSENT ON {tot_cnt} TOTAL).</div>"

    body = f"""
    <div class="grid-2">
      <div id="ctl00_mainContent_divCourse" class="course-list">
        <div style="font-weight:700;margin-bottom:8px;">Select a course (Fall2026)</div>
        {links_html or '<div>No courses</div>'}
      </div>
      <div id="ctl00_mainContent_divContent">
        <div style="font-weight:700;margin-bottom:8px;">
          {escape(selected['subject_name'] + ' (' + selected['subject_code'] + ') - ' + selected['group']) if selected else ''}
        </div>
        <table class="table table-bordered">
          <thead>
            <tr>
              <th>No</th><th>Date</th><th>Slot</th><th>Room</th>
              <th>Lecturer</th><th>Group Name</th><th>Attendance status</th><th>Lecturer's comment</th>
            </tr>
          </thead>
          <tbody>
            {detail_rows}
          </tbody>
        </table>
        {summary_footer}
      </div>
    </div>
    """
    return _html_with_cookie(_fap_layout(bundle, "View Attendance for Student", body), bundle["student_id"])
