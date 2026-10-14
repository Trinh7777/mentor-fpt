"""BƯỚC 4 - Logic nghiệp vụ thuần Python (GPA, tiến độ, tiên quyết, học lại...).
Mọi con số chatbot nói ra đều phải đến từ đây, KHÔNG để LLM tự tính."""
import math
from config import (PASS_GRADE, ATTENDANCE_LIMIT, DEFAULT_CREDITS, CREDIT_OVERRIDES, NON_GPA_SUBJECTS,
                    TUITION_PER_CREDIT, DEFAULT_CAMPUS, LIBRARY_FINE_PER_DAY, LIBRARY_COMPENSATE_AFTER_DAYS)
from data_loader import load_all


def credits_of(code):
    return CREDIT_OVERRIDES.get(code, DEFAULT_CREDITS)


def classify(gpa):
    """Xếp loại tham khảo (thang 10)."""
    if gpa >= 9.0: return "Xuất sắc"
    if gpa >= 8.0: return "Giỏi"
    if gpa >= 7.0: return "Khá"
    if gpa >= 6.0: return "Trung bình khá"
    if gpa >= PASS_GRADE: return "Trung bình"
    return "Yếu"


class StudentAdvisor:
    def __init__(self, student_id: str, campus: str = DEFAULT_CAMPUS):
        d = load_all()
        if student_id not in d["students"]:
            raise ValueError(f"Không có sinh viên {student_id}")
        self.d = d
        self.sid = student_id
        self.student = d["students"][student_id]
        self.campus = campus if campus in TUITION_PER_CREDIT else DEFAULT_CAMPUS
        self.records = [r for r in d["transcript"] if r["student_id"] == student_id]

    # ---------- helpers ----------
    def _name(self, code):
        s = self.d["subjects"].get(code)
        return s["subject_name"] if s else code

    def _latest(self):
        """Lần học gần nhất của mỗi môn (học lại thì lấy lần sau cùng)."""
        out = {}
        for i, r in enumerate(self.records):
            k = r["subject_code"]
            if k not in out or (r["semester_taken"], i) >= (out[k]["semester_taken"], out[k]["_i"]):
                out[k] = {**r, "_i": i}
        return out

    def _norm_code(self, code):
        for c in self.d["subjects"]:
            if c.lower() == str(code).strip().lower():
                return c
        return None

    def _prereq_status(self, code, latest):
        r = latest.get(code)
        if not r: return "chưa học"
        if r["status"] == "Studying": return "đang học"
        return "đã qua" if r["status"] == "Passed" else "đang nợ (trượt)"

    # ---------- 1. hồ sơ ----------
    def profile(self):
        s = self.student
        return {"student_id": s["student_id"], "full_name": s["full_name"], "email": s["email"],
                "major": s["major"], "current_semester": s["current_semester"],
                "status": s["status"], "campus_for_fee": self.campus}

    # ---------- 2. bảng điểm ----------
    def transcript(self, semester=None):
        rows = [r for r in self.records if semester is None or r["semester_taken"] == semester]
        rows = sorted(rows, key=lambda r: r["semester_taken"])
        return {"semester": semester, "count": len(rows), "rows": [
            {"semester": r["semester_taken"], "subject_code": r["subject_code"],
             "subject_name": self._name(r["subject_code"]), "credits": credits_of(r["subject_code"]),
             "grade": r["grade"], "status": r["status"]} for r in rows]}

    # ---------- 3. GPA ----------
    def gpa(self, semester=None):
        if semester is None:
            recs = list(self._latest().values())
        else:
            recs = [r for r in self.records if r["semester_taken"] == semester]
        graded = [r for r in recs if r["grade"] is not None and r["status"] in ("Passed", "Failed")
                  and r["subject_code"] not in NON_GPA_SUBJECTS]
        cr = sum(credits_of(r["subject_code"]) for r in graded)
        pts = sum(r["grade"] * credits_of(r["subject_code"]) for r in graded)
        gpa = round(pts / cr, 2) if cr else None
        res = {"scope": f"Học kỳ {semester}" if semester else "Tích lũy",
               "gpa": gpa, "classification": classify(gpa) if gpa is not None else None,
               "credits_counted": cr, "subjects_counted": len(graded),
               "note": "GPA = tổng(điểm x tín chỉ)/tổng tín chỉ; môn học lại lấy lần học gần nhất; "
                       "OJT không tính GPA; tín chỉ là giả định mặc định."}
        if semester is None:
            by_sem = {}
            for r in self.records:
                if (r["grade"] is not None and r["status"] in ("Passed", "Failed")
                        and r["subject_code"] not in NON_GPA_SUBJECTS):
                    by_sem.setdefault(r["semester_taken"], []).append(r)
            res["by_semester"] = {s: round(sum(x["grade"] * credits_of(x["subject_code"]) for x in v) /
                                           sum(credits_of(x["subject_code"]) for x in v), 2)
                                  for s, v in sorted(by_sem.items())}
        return res

    def plan_target_gpa(self, target_gpa):
        """Cần trung bình bao nhiêu ở các tín chỉ còn lại để đạt GPA mục tiêu khi tốt nghiệp."""
        latest = self._latest()
        total = sum(credits_of(c) for c in self.d["subjects"] if c not in NON_GPA_SUBJECTS)
        done = [r for c, r in latest.items() if r["status"] == "Passed" and r["grade"] is not None
                and c not in NON_GPA_SUBJECTS]
        done_cr = sum(credits_of(r["subject_code"]) for r in done)
        done_pts = sum(r["grade"] * credits_of(r["subject_code"]) for r in done)
        remain = total - done_cr
        if remain <= 0:
            return {"message": "Đã hoàn thành hết môn tính GPA.", "current_gpa": round(done_pts / done_cr, 2)}
        need = (target_gpa * total - done_pts) / remain
        verdict = ("Đã đạt mục tiêu, chỉ cần giữ điểm trên mức này" if need <= PASS_GRADE else
                   "Khả thi" if need <= 8.5 else "Khá thử thách" if need <= 10 else "Không thể đạt (cần > 10)")
        return {"target_gpa": target_gpa, "current_gpa_passed_only": round(done_pts / done_cr, 2),
                "credits_done": done_cr, "credits_remaining": remain,
                "required_average_on_remaining": round(need, 2), "verdict": verdict,
                "note": "Môn đang nợ/đang học/chưa học đều được tính vào phần còn lại."}

    # ---------- 4. tiến độ ----------
    def progress(self):
        latest = self._latest()
        passed, studying, failed, notyet = [], [], [], []
        for code, s in self.d["subjects"].items():
            r = latest.get(code)
            item = {"subject_code": code, "name": s["subject_name"], "curriculum_semester": s["semester"],
                    "credits": credits_of(code)}
            if not r: notyet.append(item)
            elif r["status"] == "Passed": passed.append(item)
            elif r["status"] == "Studying": studying.append(item)
            else: failed.append({**item, "last_grade": r["grade"], "failed_in_semester": r["semester_taken"]})
        total_cr = sum(credits_of(c) for c in self.d["subjects"])
        passed_cr = sum(i["credits"] for i in passed)
        return {"credits_passed": passed_cr, "credits_total": total_cr,
                "percent": round(100 * passed_cr / total_cr, 1),
                "passed_count": len(passed), "studying": studying, "failed_pending_retake": failed,
                "not_taken_yet": notyet}

    # ---------- 5. tiên quyết ----------
    def check_prerequisites(self, subject_code):
        code = self._norm_code(subject_code)
        if not code:
            return {"error": f"Không tìm thấy môn '{subject_code}' trong chương trình."}
        latest = self._latest()
        reqs, ok = [], True
        for p in self.d["prereqs"].get(code, []):
            r = latest.get(p["prerequisite_code"])
            met = bool(r and r["status"] == "Passed" and r["grade"] is not None and r["grade"] >= p["minimum_grade"])
            ok &= met
            reqs.append({"prerequisite": p["prerequisite_code"], "name": self._name(p["prerequisite_code"]),
                         "min_grade": p["minimum_grade"], "your_grade": r["grade"] if r else None,
                         "state": self._prereq_status(p["prerequisite_code"], latest), "met": met})
        unlocks = [c for c, ps in self.d["prereqs"].items() if any(p["prerequisite_code"] == code for p in ps)]
        own = latest.get(code)
        return {"subject_code": code, "name": self._name(code),
                "curriculum_semester": self.d["subjects"][code]["semester"],
                "your_status": own["status"] if own else "chưa học",
                "prerequisites": reqs, "can_register": ok,
                "unlocks_subjects": unlocks}

    def suggest_next(self):
        latest = self._latest()
        cur = self.student["current_semester"]
        recommended, blocked, later = [], [], []
        for code, s in self.d["subjects"].items():
            r = latest.get(code)
            if r and r["status"] in ("Passed", "Studying"):
                continue
            info = self.check_prerequisites(code)
            item = {"subject_code": code, "name": s["subject_name"], "curriculum_semester": s["semester"],
                    "credits": credits_of(code), "retake": bool(r)}
            if not info["can_register"]:
                item["missing"] = [f"{p['prerequisite']} ({p['state']})" for p in info["prerequisites"] if not p["met"]]
                blocked.append(item)
            elif s["semester"] <= cur + 1:
                recommended.append(item)
            else:
                later.append(item)
        recommended.sort(key=lambda x: (not x["retake"], x["curriculum_semester"]))
        return {"current_semester": cur, "recommended_next_semester": recommended,
                "blocked_by_prerequisites": blocked, "eligible_but_later_in_curriculum": later[:6]}

    # ---------- 6. học lại & học phí ----------
    def failed_subjects(self):
        return [i for i in self.progress()["failed_pending_retake"]]

    def retake_fee(self, subject_code=None, retake_semester=None):
        price = TUITION_PER_CREDIT[self.campus]
        target = retake_semester or self.student["current_semester"] + 1
        items = self.failed_subjects()
        if subject_code:
            code = self._norm_code(subject_code)
            items = [i for i in items if i["subject_code"] == code]
            if not items:
                return {"error": f"Bạn không có môn {subject_code} đang nợ (có thể đã qua/đang học lại)."}
        out = []
        for i in items:
            full, half = i["credits"] * price, i["credits"] * price // 2
            early = target - i["failed_in_semester"] <= 1
            out.append({"subject_code": i["subject_code"], "name": i["name"], "credits": i["credits"],
                        "failed_in_semester": i["failed_in_semester"], "retake_in_semester": target,
                        "is_early_retake": early, "fee_applied": half if early else full,
                        "fee_if_early_50pct": half, "fee_if_normal_100pct": full,
                        "extra_note": "OJT/đồ án có thể có biểu phí riêng, số này chỉ ước tính."
                        if i["subject_code"] in NON_GPA_SUBJECTS or i["subject_code"] == "AIP491" else ""})
        return {"campus": self.campus, "price_per_credit": price, "items": out,
                "total": sum(o["fee_applied"] for o in out),
                "rules": "Học lại sớm (ngay kỳ trượt hoặc kỳ kế tiếp) = 50% học phí; sau đó = 100%. "
                         "Vi phạm quy chế thi: nhân đôi. Hủy lớp trước khai giảng hoàn 50%; trường không mở lớp hoàn 100% "
                         "(QĐ 107/QĐ-CTGDFPT)."}

    # ---------- 7. tiện ích ----------
    @staticmethod
    def check_attendance(total_slots, absent_slots):
        if total_slots <= 0:
            return {"error": "Tổng số slot phải > 0"}
        allowed = math.floor(total_slots * ATTENDANCE_LIMIT)
        pct = round(100 * absent_slots / total_slots, 1)
        return {"total_slots": total_slots, "absent_slots": absent_slots, "absent_percent": pct,
                "max_absent_allowed": allowed, "remaining_absences": max(allowed - absent_slots, 0),
                "attendance_fail": absent_slots > allowed,
                "rule": "Vắng quá 20% thời lượng -> không được thi cuối kỳ (AF). Đi muộn quá 5 phút tính vắng slot đó."}

    @staticmethod
    def library_fine(days_late, book_price=0):
        fine = days_late * LIBRARY_FINE_PER_DAY
        over = days_late > LIBRARY_COMPENSATE_AFTER_DAYS
        return {"days_late": days_late, "late_fee": fine, "must_compensate_book_price": over,
                "total": fine + (book_price if over else 0),
                "rule": "5.000đ/ngày; quá 30 ngày phải đền thêm giá nhập tài liệu."}
