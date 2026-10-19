"""BƯỚC 4 - Logic nghiệp vụ thuần Python (GPA, tiến độ, tiên quyết, học lại, điểm FE, xét OJT/KLTN...).
Mọi con số chatbot nói ra đều phải đến từ đây, KHÔNG để LLM tự tính."""
import math
from config import (PASS_GRADE, ATTENDANCE_LIMIT, DEFAULT_CREDITS, CREDIT_OVERRIDES, NON_GPA_SUBJECTS,
                    TUITION_PER_CREDIT, DEFAULT_CAMPUS, LIBRARY_FINE_PER_DAY, LIBRARY_COMPENSATE_AFTER_DAYS)
from data_loader import load_all


def credits_of(code):
    d = load_all()
    subj = d.get("subjects", {}).get(code)
    if subj and "credits" in subj:
        return int(subj["credits"])
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
        if not code:
            return None
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
                       "OJT202 không tính vào GPA."}
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
        verdict = ("Đã đạt mục tiêu, chỉ cần giữ điểm trên mức qua môn" if need <= PASS_GRADE else
                   "Khả thi" if need <= 8.5 else "Khá thử thách" if need <= 10 else "Không thể đạt (cần > 10)")
        return {"target_gpa": target_gpa, "current_gpa_passed_only": round(done_pts / done_cr, 2) if done_cr else 0.0,
                "credits_done": done_cr, "credits_remaining": remain,
                "required_average_on_remaining": round(need, 2), "verdict": verdict,
                "note": "Môn đang nợ/đang học/chưa học đều được tính vào phần còn lại."}

    # ---------- 4. tiến độ & sơ đồ cây môn học ----------
    def progress(self):
        latest = self._latest()
        passed, studying, failed, notyet = [], [], [], []
        for code, s in self.d["subjects"].items():
            r = latest.get(code)
            item = {"subject_code": code, "name": s["subject_name"], "curriculum_semester": s["semester"],
                    "credits": credits_of(code)}
            if not r: notyet.append(item)
            elif r["status"] == "Passed": passed.append({**item, "grade": r["grade"]})
            elif r["status"] == "Studying": studying.append(item)
            else: failed.append({**item, "last_grade": r["grade"], "failed_in_semester": r["semester_taken"]})
        total_cr = sum(credits_of(c) for c in self.d["subjects"])
        passed_cr = sum(i["credits"] for i in passed)
        return {"credits_passed": passed_cr, "credits_total": total_cr,
                "percent": round(100 * passed_cr / total_cr, 1),
                "passed_count": len(passed), "passed": passed, "studying": studying,
                "failed_pending_retake": failed, "not_taken_yet": notyet}

    def curriculum_roadmap(self):
        """Trả về toàn bộ khung chương trình 9 kỳ kèm trạng thái từng môn và chuỗi môn mở khóa."""
        latest = self._latest()
        semesters = {}
        for code, s in self.d["subjects"].items():
            sem = s["semester"]
            r = latest.get(code)
            prereq_info = self.check_prerequisites(code)
            if r and r["status"] == "Passed":
                ui_state = "Passed"
            elif r and r["status"] == "Studying":
                ui_state = "Studying"
            elif r and r["status"] == "Failed":
                ui_state = "Failed"
            elif not prereq_info["can_register"]:
                ui_state = "Locked"
            else:
                ui_state = "Available"

            semesters.setdefault(sem, []).append({
                "subject_code": code,
                "name": s["subject_name"],
                "credits": credits_of(code),
                "grade": r["grade"] if r else None,
                "state": ui_state,
                "prerequisites": [p["prerequisite"] for p in prereq_info["prerequisites"]],
                "missing_prereqs": [p["prerequisite"] for p in prereq_info["prerequisites"] if not p["met"]],
                "unlocks": prereq_info["unlocks_subjects"],
            })
        return semesters

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

    # ---------- 7. Tính điểm Final Exam (FE) cần đạt & Điều kiện OJT / Tốt nghiệp ----------
    def calculate_required_final_score(self, coursework_avg: float, subject_code: str = None,
                                       fe_weight: float = None, target_total: float = 5.0):
        """Tính điểm thi Final Exam (FE) tối thiểu cần đạt để qua môn (hoặc đạt điểm mục tiêu target_total).
        Chuẩn quy chế khảo thí FPTU: Tổng kết >= 5.0 VÀ Điểm thi Final Exam (FE) >= 4.0."""
        code = self._norm_code(subject_code) if subject_code else None
        subj_info = self.d["subjects"].get(code, {}) if code else {}

        if fe_weight is None:
            fe_weight = subj_info.get("fe_weight", 0.4)
        elif fe_weight > 1.0:
            fe_weight = fe_weight / 100.0

        min_fe_floor = subj_info.get("min_fe", 4.0)

        if fe_weight <= 0:
            return {
                "subject_code": code or subject_code or "Môn đồ án/thực hành",
                "coursework_avg": coursework_avg,
                "fe_weight": 0.0,
                "message": "Môn học này đánh giá bằng đồ án/quá trình (không có kỳ thi Final Exam truyền thống). "
                           f"Điểm tổng kết cần đạt tối thiểu {max(target_total, PASS_GRADE)}."
            }

        cw_weight = round(1.0 - fe_weight, 2)
        cw_contribution = round(coursework_avg * cw_weight, 2)
        effective_target = max(target_total, PASS_GRADE)

        raw_needed_fe = (effective_target - cw_contribution) / fe_weight
        required_fe = round(max(raw_needed_fe, min_fe_floor), 2)

        if required_fe > 10.0:
            status = "Không thể đạt (Cần > 10.0 điểm FE)"
        elif required_fe == min_fe_floor and raw_needed_fe <= min_fe_floor:
            status = f"Rất an toàn! Điểm quá trình đã gánh tốt, chỉ cần tránh điểm liệt FE (>= {min_fe_floor})"
        elif required_fe <= 6.5:
            status = "Khả thi, nằm trong tầm tay"
        elif required_fe <= 8.5:
            status = "Cần ôn tập kỹ để bứt phá"
        else:
            status = "Báo động đỏ! Cần điểm FE rất cao"

        return {
            "subject_code": code or subject_code or "Môn học",
            "subject_name": subj_info.get("subject_name", ""),
            "coursework_average": coursework_avg,
            "coursework_weight_pct": int(cw_weight * 100),
            "fe_weight_pct": int(fe_weight * 100),
            "coursework_points_accumulated": cw_contribution,
            "target_total_grade": effective_target,
            "fpt_min_fe_floor": min_fe_floor,
            "raw_fe_for_total": round(raw_needed_fe, 2),
            "required_fe_score": required_fe,
            "verdict": status,
            "rule": f"Tại FPTU, để qua môn cần đồng thời: Điểm tổng kết >= {PASS_GRADE} VÀ Điểm thi Final Exam (FE) >= {min_fe_floor} (không bị điểm liệt thành phần)."
        }

    def check_ojt_and_graduation_eligibility(self):
        """Kiểm tra điều kiện đi Thực tập doanh nghiệp (OJT202 - Kỳ 6) và Khóa luận tốt nghiệp (AIP491 - Kỳ 9)."""
        latest = self._latest()

        # 1. Xét điều kiện đi OJT (tích lũy >= 90% số tín chỉ giai đoạn Kỳ 1 -> Kỳ 5)
        pre_ojt_subjects = [c for c, s in self.d["subjects"].items() if s["semester"] <= 5]
        pre_ojt_total_cr = sum(credits_of(c) for c in pre_ojt_subjects)
        pre_ojt_passed_cr = sum(
            credits_of(c) for c in pre_ojt_subjects
            if latest.get(c) and latest[c]["status"] == "Passed"
        )
        pre_ojt_studying_cr = sum(
            credits_of(c) for c in pre_ojt_subjects
            if latest.get(c) and latest[c]["status"] == "Studying"
        )
        ojt_ratio_current = round(100 * pre_ojt_passed_cr / pre_ojt_total_cr, 1) if pre_ojt_total_cr else 0.0
        ojt_ratio_projected = round(100 * (pre_ojt_passed_cr + pre_ojt_studying_cr) / pre_ojt_total_cr, 1) if pre_ojt_total_cr else 0.0
        ojt_done = bool(latest.get("OJT202") and latest["OJT202"]["status"] == "Passed")

        # 2. Xét điều kiện làm Đồ án tốt nghiệp (AIP491) và Xét tốt nghiệp
        prog = self.progress()
        failed_list = [f["subject_code"] for f in prog["failed_pending_retake"]]
        capstone_done = bool(latest.get("AIP491") and latest["AIP491"]["status"] == "Passed")
        can_do_capstone = ojt_done and len(failed_list) == 0 and prog["credits_passed"] >= (prog["credits_total"] - 20)

        return {
            "current_semester": self.student["current_semester"],
            "ojt_eligibility": {
                "ojt_completed": ojt_done,
                "pre_ojt_credits_passed": pre_ojt_passed_cr,
                "pre_ojt_credits_studying": pre_ojt_studying_cr,
                "pre_ojt_credits_total": pre_ojt_total_cr,
                "current_percentage": ojt_ratio_current,
                "projected_percentage_after_this_term": ojt_ratio_projected,
                "required_percentage": 90.0,
                "is_eligible_now": ojt_ratio_current >= 90.0 or ojt_done,
                "is_eligible_if_pass_studying": ojt_ratio_projected >= 90.0 or ojt_done,
                "rule": "Sinh viên phải tích lũy đạt tối thiểu 90% tổng số tín chỉ giai đoạn trước OJT (Kỳ 1–5) theo Phụ lục 4 (07.04PL-QT/ĐH/HDCV/FE)."
            },
            "capstone_and_graduation": {
                "capstone_completed": capstone_done,
                "eligible_for_capstone_AIP491": can_do_capstone,
                "total_credits_passed": prog["credits_passed"],
                "total_credits_required": prog["credits_total"],
                "pending_failed_subjects": failed_list,
                "mandatory_non_gpa_checklist": [
                    "Hoàn thành Giáo dục thể chất (Vovinam / Cờ vua)",
                    "Chứng chỉ Giáo dục Quốc phòng - An ninh (GDQP)",
                    "Chứng chỉ Tiếng Anh chuẩn đầu ra theo quy định",
                    "Không nợ học phí & Không nợ sách/phạt Thư viện"
                ],
                "rule": "Để làm KLTN (AIP491) và xét tốt nghiệp, sinh viên phải hoàn thành OJT202, đạt các môn tiên quyết và tích lũy đủ tín chỉ chương trình (Phụ lục 5 & 6)."
            }
        }

    # ---------- 8. Dự báo tốt nghiệp, xếp loại học lực & Giả lập GPA (What-if Simulation) ----------
    def simulate_semester_grades(self, expected_grades: dict):
        """Giả lập GPA học kỳ và GPA tích lũy mới nếu sinh viên nhập điểm dự kiến của các môn trong kỳ.
        expected_grades: dict dạng {'DPL302m': 8.5, 'BDI302c': 7.5, ...}"""
        latest = self._latest()
        norm_expected = {}
        invalid_subjects = []
        for raw_code, score in (expected_grades or {}).items():
            c = self._norm_code(raw_code)
            if c:
                norm_expected[c] = float(score)
            else:
                invalid_subjects.append(raw_code)

        # GPA tích lũy hiện tại trước khi giả lập
        current_gpa_info = self.gpa()
        old_gpa = current_gpa_info["gpa"] or 0.0
        old_class = current_gpa_info["classification"]

        # Áp dụng điểm giả lập vào bản sao latest
        sim_latest = {k: dict(v) for k, v in latest.items()}
        simulated_details = []
        cur_sem = self.student["current_semester"]

        for code, score in norm_expected.items():
            status = "Passed" if score >= PASS_GRADE else "Failed"
            prev_grade = sim_latest.get(code, {}).get("grade")
            sim_latest[code] = {
                "student_id": self.sid,
                "subject_code": code,
                "semester_taken": cur_sem,
                "grade": score,
                "status": status
            }
            simulated_details.append({
                "subject_code": code,
                "subject_name": self._name(code),
                "credits": credits_of(code),
                "simulated_grade": score,
                "previous_grade": prev_grade,
                "resulting_status": status
            })

        # Các môn đang Studying trong kỳ mà sinh viên CHƯA truyền điểm dự kiến
        studying_missing = [
            {"subject_code": c, "subject_name": self._name(c), "credits": credits_of(c)}
            for c, r in latest.items()
            if r["status"] == "Studying" and c not in norm_expected
        ]

        # Tính GPA học kỳ giả lập (trên các môn vừa nhập + các môn đã có điểm trong kỳ hiện tại)
        sem_graded = [
            r for c, r in sim_latest.items()
            if r.get("semester_taken") == cur_sem and r.get("grade") is not None and c not in NON_GPA_SUBJECTS
        ]
        sem_cr = sum(credits_of(r["subject_code"]) for r in sem_graded)
        sem_pts = sum(r["grade"] * credits_of(r["subject_code"]) for r in sem_graded)
        sim_sem_gpa = round(sem_pts / sem_cr, 2) if sem_cr else None

        # Tính GPA tích lũy mới sau khi gộp điểm giả lập
        all_graded = [
            r for c, r in sim_latest.items()
            if r.get("grade") is not None and r.get("status") in ("Passed", "Failed") and c not in NON_GPA_SUBJECTS
        ]
        new_cr = sum(credits_of(r["subject_code"]) for r in all_graded)
        new_pts = sum(r["grade"] * credits_of(r["subject_code"]) for r in all_graded)
        new_gpa = round(new_pts / new_cr, 2) if new_cr else 0.0
        new_class = classify(new_gpa)

        return {
            "simulated_subjects": simulated_details,
            "unentered_studying_subjects": studying_missing,
            "invalid_subject_codes": invalid_subjects,
            "semester_gpa_projected": sim_sem_gpa,
            "semester_classification": classify(sim_sem_gpa) if sim_sem_gpa is not None else None,
            "cumulative_gpa_before": old_gpa,
            "classification_before": old_class,
            "cumulative_gpa_after": new_gpa,
            "classification_after": new_class,
            "gpa_delta": round(new_gpa - old_gpa, 2),
            "total_credits_counted_after": new_cr,
        }

    def predict_graduation_forecast(self, current_date_str: str = "2026-10"):
        """Dự báo thời điểm tốt nghiệp (tháng/năm, học kỳ), xếp loại học lực dự kiến bằng Hồi quy xu hướng (Linear Trend)
        & kiểm tra rủi ro trễ hạn ra trường do chuỗi môn tiên quyết."""
        cur_sem = self.student["current_semester"]
        prog = self.progress()
        gpa_info = self.gpa()
        cur_gpa = gpa_info["gpa"] or 0.0
        by_sem = gpa_info.get("by_semester", {})

        # 1. Phân tích xu hướng điểm qua các học kỳ (Linear Regression slope)
        sem_keys = sorted(by_sem.keys())
        slope = 0.0
        if len(sem_keys) >= 2:
            n = len(sem_keys)
            mean_x = sum(sem_keys) / n
            mean_y = sum(by_sem[k] for k in sem_keys) / n
            num = sum((k - mean_x) * (by_sem[k] - mean_y) for k in sem_keys)
            den = sum((k - mean_x) ** 2 for k in sem_keys)
            slope = round(num / den, 3) if den > 0 else 0.0

        trend_label = (
            "Đang tăng trưởng tốt 📈" if slope >= 0.08 else
            "Đang có xu hướng giảm 📉" if slope <= -0.08 else
            "Ổn định ➡️"
        )

        # Dự phóng điểm trung bình các kỳ còn lại theo xu hướng + hồi quy về trung bình
        projected_future_avg = min(max(round(cur_gpa + slope * 1.5, 2), 5.0), 9.5)
        total_gpa_cr = sum(credits_of(c) for c in self.d["subjects"] if c not in NON_GPA_SUBJECTS)
        done_cr = gpa_info["credits_counted"]
        remain_cr = max(total_gpa_cr - done_cr, 0)
        projected_final_gpa = round(
            (cur_gpa * done_cr + projected_future_avg * remain_cr) / total_gpa_cr, 2
        ) if total_gpa_cr else cur_gpa

        # 2. Tính số học kỳ còn lại & kiểm tra độ trễ do nợ môn / cấm thi AF
        base_remaining_sems = max(9 - cur_sem, 0)
        failed_list = prog["failed_pending_retake"]
        failed_codes = [f["subject_code"] for f in failed_list]

        # Kiểm tra xem có môn nào đang bị cấm thi AF trong kỳ hiện tại không
        att_info = self.get_attendance_details()
        af_subject = att_info.get("subject_code") if att_info and att_info.get("is_attendance_fail") else None
        if af_subject and af_subject not in failed_codes:
            failed_codes.append(f"{af_subject} (Bị cấm thi AF kỳ này)")

        # Kiểm tra chuỗi tiên quyết: nếu môn đang nợ chặn môn kỳ sau -> nguy cơ trễ kỳ
        chain_blocked = []
        for f_item in failed_list:
            fc = f_item["subject_code"]
            unlocked = [c for c, ps in self.d["prereqs"].items() if any(p["prerequisite_code"] == fc for p in ps)]
            if unlocked:
                chain_blocked.append({"failed_subject": fc, "blocks": unlocked})

        # Mỗi ~4-5 môn nợ hoặc chuỗi tiên quyết bị đứt có thể làm trễ thêm 1 học kỳ
        extra_sems_delay = 0
        if len(failed_codes) >= 4 or (len(chain_blocked) >= 2):
            extra_sems_delay = 1
        if len(failed_codes) >= 8:
            extra_sems_delay = 2

        # Tính toán mốc thời gian tốt nghiệp theo lịch 3 kỳ/năm của FPTU (Spring: T1-T4, Summer: T5-T8, Fall: T9-T12)
        # Mặc định thời điểm hiện tại là Học kỳ Fall 2026 (Tháng 10/2026)
        fpt_terms = [
            ("Fall 2026", "Tháng 12/2026", 2026),
            ("Spring 2027", "Tháng 04/2027", 2027),
            ("Summer 2027", "Tháng 08/2027", 2027),
            ("Fall 2027", "Tháng 12/2027", 2027),
            ("Spring 2028", "Tháng 04/2028", 2028),
            ("Summer 2028", "Tháng 08/2028", 2028),
            ("Fall 2028", "Tháng 12/2028", 2028),
            ("Spring 2029", "Tháng 04/2029", 2029),
            ("Summer 2029", "Tháng 08/2029", 2029),
            ("Fall 2029", "Tháng 12/2029", 2029),
        ]
        on_time_idx = min(base_remaining_sems, len(fpt_terms) - 1)
        realistic_idx = min(base_remaining_sems + extra_sems_delay, len(fpt_terms) - 1)

        on_time_term, on_time_month, on_time_year = fpt_terms[on_time_idx]
        real_term, real_month, real_year = fpt_terms[realistic_idx]

        # Ngưỡng điểm cần đạt ở phần còn lại cho từng mức Bằng Tốt Nghiệp
        thresholds = {}
        for label, target in [("Xuất sắc (9.0)", 9.0), ("Giỏi (8.0)", 8.0), ("Khá (7.0)", 7.0)]:
            plan = self.plan_target_gpa(target)
            thresholds[label] = {
                "required_avg": plan.get("required_average_on_remaining"),
                "verdict": plan.get("verdict")
            }

        return {
            "current_semester": cur_sem,
            "remaining_standard_semesters": base_remaining_sems,
            "estimated_delay_semesters": extra_sems_delay,
            "on_time_graduation": {
                "finish_semester": on_time_term,
                "finish_study_month": on_time_month,
                "graduation_year": on_time_year,
                "note": "Nếu học đúng lộ trình 3 kỳ/năm của FPTU và trả các môn nợ (nếu có) song song trong kỳ chính."
            },
            "realistic_graduation_forecast": {
                "finish_semester": real_term,
                "finish_study_month": real_month,
                "graduation_year": real_year,
                "ceremony_and_diploma_estimate": f"Lễ tốt nghiệp & nhận bằng dự kiến sau ~1–2 tháng ({real_year})"
            },
            "academic_standing_forecast": {
                "current_gpa": cur_gpa,
                "current_classification": gpa_info["classification"],
                "gpa_trend_slope_per_semester": slope,
                "gpa_trend_description": trend_label,
                "projected_graduation_gpa": projected_final_gpa,
                "projected_graduation_classification": classify(projected_final_gpa),
                "degree_classification_targets": thresholds
            },
            "risk_factors": {
                "pending_retake_or_af_subjects": failed_codes,
                "prerequisite_chains_blocked": chain_blocked,
                "advice": (
                    "Bạn hoàn toàn có thể ra trường đúng hạn nếu đăng ký học lại sớm môn nợ ngay kỳ tới."
                    if failed_codes else
                    "Tiến độ rất sạch! Bạn không nợ môn nào và dự kiến tốt nghiệp đúng hạn 100%."
                )
            }
        }

    # ---------- 9. tiện ích ----------
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

    # ---------- 10. Thời khóa biểu & Điểm danh FAP & Đơn từ ----------
    def get_schedule(self):
        live = self.d.get("live", {})
        if live and live.get("student_id") == self.sid and live.get("schedule"):
            return {
                "student_id": self.sid,
                "full_name": self.student["full_name"],
                "semester": self.student["current_semester"],
                "week": f"Đồng bộ từ FAP ({live.get('synced_at', '')[:10]})",
                "schedule": live["schedule"]
            }
        cases = self.d.get("cases", {})
        schedules = cases.get("schedules", {})
        if self.sid in schedules:
            return schedules[self.sid]
        return cases.get("student_schedule", {"message": f"Chưa có dữ liệu thời khóa biểu cho sinh viên {self.sid}."})

    def get_attendance_details(self, subject_code=None):
        cases = self.d.get("cases", {})
        attendances = cases.get("attendances", {})
        att = attendances.get(self.sid) or cases.get("student_attendance", {})
        if not att:
            return {"message": f"Chưa có dữ liệu điểm danh chi tiết cho sinh viên {self.sid}."}
        if subject_code:
            code = self._norm_code(subject_code) or subject_code
            if att.get("subject_code", "").lower() != code.lower():
                return {"message": f"Hiện tại hệ thống có dữ liệu điểm danh môn {att.get('subject_code')}, chưa có dữ liệu chi tiết từng slot của môn {subject_code}."}
        return att

    def get_application_procedure(self, application_name=None):
        cases = self.d.get("cases", {})
        app_data = cases.get("fap_applications", {})
        if not app_data:
            return {"message": "Chưa có dữ liệu hướng dẫn đơn từ."}
        if application_name:
            from policy_search import normalize
            norm_q = normalize(application_name)
            if any(k in norm_q for k in ["nvqs", "nghia vu quan su", "tam hoan"]):
                return {
                    "general_procedure": app_data.get("general_procedure"),
                    "specific_application": app_data.get("military_service_exemption"),
                    "matched": "Đơn xin tạm hoãn nghĩa vụ quân sự (NVQS)"
                }
            matched = []
            for a in app_data.get("application_types", []):
                norm_name = normalize(a["name"])
                keywords = [w for w in norm_name.split() if w not in {"dang", "ky", "de", "nghi", "cac", "loai", "don", "khac", "hoc"}]
                if any(k in norm_q for k in keywords) or any(w in norm_name for w in norm_q.split() if len(w) > 3):
                    matched.append(a)
            return {
                "general_procedure": app_data.get("general_procedure"),
                "matched_applications": matched or app_data.get("application_types", []),
                "military_service_exemption": app_data.get("military_service_exemption")
            }
        return app_data



