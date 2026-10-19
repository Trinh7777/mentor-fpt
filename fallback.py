"""BƯỚC 6 - Chế độ DỰ PHÒNG khi chưa có API key: nhận diện ý định bằng từ khóa rồi gọi thẳng advisor.
Giúp bạn test toàn bộ logic mà không tốn quota Gemini."""
import re
from advisor import StudentAdvisor
from policy_search import normalize, search_policy
from data_loader import find_subject_code, load_all

vnd = lambda x: f"{x:,.0f}đ".replace(",", ".")


def _sem(text):
    m = re.search(r"(?:ky|hk|semester)\s*(\d)", normalize(text))
    return int(m.group(1)) if m else None


def answer(text: str, adv: StudentAdvisor):
    """Trả về (markdown, tool_log)."""
    n = normalize(text)
    subj = find_subject_code(text, load_all()["subjects"])
    log = []

    def call(name, res):
        log.append({"tool": name, "args": {}, "result": res}); return res

    # 0a. Giả lập GPA dự kiến khi sinh viên nhập điểm các môn trong kỳ (vd: "DPL302m 8.5, BDI302c 7.5")
    all_subjects = load_all()["subjects"]
    grade_pairs = {}
    for code in all_subjects:
        pat = re.search(rf"\b{re.escape(code.lower())}\D{{0,12}}?(\d+(?:[.,]\d+)?)", text.lower())
        if pat:
            val = float(pat.group(1).replace(",", "."))
            if 0.0 <= val <= 10.0:
                grade_pairs[code] = val

    if len(grade_pairs) >= 2 or (len(grade_pairs) == 1 and any(k in n for k in ["du kien", "gia su", "neu duoc", "gpa", "xep loai"])):
        r = call("simulate_semester_grades", adv.simulate_semester_grades(grade_pairs))
        sim_lines = [f"- **{x['subject_code']} ({x['subject_name']})**: `{x['simulated_grade']}` điểm ({x['credits']} TC) → *{x['resulting_status']}*"
                     for x in r["simulated_subjects"]]
        missing_note = ""
        if r["unentered_studying_subjects"]:
            m_codes = ", ".join(x["subject_code"] for x in r["unentered_studying_subjects"])
            missing_note = f"\n\n💡 *Lưu ý:* Bạn còn các môn đang học kỳ này chưa nhập điểm dự kiến: **{m_codes}**. Hãy nhập thêm nếu muốn tính trọn vẹn cả học kỳ!"
        delta_sign = f"+{r['gpa_delta']}" if r["gpa_delta"] >= 0 else str(r["gpa_delta"])
        return (f"🧮 **Kết quả Giả lập GPA & Xếp loại học lực dự kiến:**\n"
                + "\n".join(sim_lines) + "\n\n"
                f"- **GPA Học kỳ {adv.student['current_semester']} dự kiến:** **{r['semester_gpa_projected']}** ({r['semester_classification']})\n"
                f"- **GPA Tích lũy trước đó:** {r['cumulative_gpa_before']} ({r['classification_before']})\n"
                f"- **GPA Tích lũy MỚI dự kiến:** **{r['cumulative_gpa_after']}** ({delta_sign}) → Xếp loại: **{r['classification_after']}**"
                + missing_note), log

    # 0b. Dự đoán năm tốt nghiệp & Dự đoán xếp loại học lực khi ra trường
    if any(k in n for k in ["nam tot nghiep", "bao gio tot nghiep", "khi nao ra truong", "nam nao ra truong", "du doan tot nghiep", "du doan xep loai", "xep loai tot nghiep", "bang tot nghiep", "ra truong dung han"]):
        r = call("predict_graduation_forecast", adv.predict_graduation_forecast())
        real_g = r["realistic_graduation_forecast"]
        acad = r["academic_standing_forecast"]
        risk = r["risk_factors"]
        targets = "\n".join(f"  + **Bằng {k}**: cần trung bình `{v['required_avg']}` ở các tín chỉ còn lại (*{v['verdict']}*)"
                            for k, v in acad["degree_classification_targets"].items())
        return (f"🎓 **Dự báo Thời điểm Tốt nghiệp & Xếp loại Học lực (AI Academic Forecast):**\n\n"
                f"**1. Dự đoán Thời gian Tốt nghiệp:**\n"
                f"- Học kỳ hiện tại: **Kỳ {r['current_semester']}/9** (còn {r['remaining_standard_semesters']} kỳ chuẩn)\n"
                f"- Học kỳ hoàn thành chương trình dự kiến: **{real_g['finish_semester']} ({real_g['finish_study_month']})**\n"
                f"- **Năm tốt nghiệp dự kiến:** **{real_g['graduation_year']}** *(Độ trễ dự kiến do nợ môn: {r['estimated_delay_semesters']} kỳ)*\n\n"
                f"**2. Dự đoán Xếp loại Học lực khi ra trường:**\n"
                f"- GPA tích lũy hiện tại: **{acad['current_gpa']}** ({acad['current_classification']}) — Xu hướng: *{acad['gpa_trend_description']}*\n"
                f"- **GPA Tốt nghiệp dự báo (theo hồi quy xu hướng):** **{acad['projected_graduation_gpa']}** → Dự kiến đạt bằng: **{acad['projected_graduation_classification']}**\n"
                f"- Mốc phấn đấu cho phần còn lại:\n{targets}\n\n"
                f"**3. Đánh giá rủi ro tiến độ:** {risk['advice']}"), log

    # 0c. Câu hỏi tính điểm thi Final Exam (FE) cần đạt
    fe_match = re.search(r"(?:qua trinh|pt|assignment|dang duoc|trung binh)\D{0,15}(\d+(?:[.,]\d+)?)", n)
    if ("fe" in n or "final" in n or "cuoi ky" in n or "qua mon" in n) and fe_match:
        cw_val = float(fe_match.group(1).replace(",", "."))
        r = call("calculate_required_final_score", adv.calculate_required_final_score(cw_val, subj))
        if "message" in r:
            return f"📌 **{r['subject_code']}**: {r['message']}", log
        return (f"🎯 **Tính điểm Final Exam (FE) môn {r['subject_code']} ({r['subject_name']}):**\n"
                f"- Điểm quá trình ({r['coursework_weight_pct']}%): **{r['coursework_average']}** (tương đương **{r['coursework_points_accumulated']}** điểm tích lũy)\n"
                f"- Trọng số thi FE: **{r['fe_weight_pct']}%** (điểm sàn không liệt: **>= {r['fpt_min_fe_floor']}**)\n"
                f"👉 **Điểm thi FE tối thiểu cần đạt để qua môn (>= {r['target_total_grade']}): `{r['required_fe_score']}` điểm**\n"
                f"💡 *Đánh giá:* {r['verdict']}."), log

    # 0d. Câu hỏi về điều kiện đi OJT / Thực tập / Làm đồ án tốt nghiệp (KLTN / AIP491)
    if any(k in n for k in ["du dieu kien ojt", "di ojt", "di thuc tap", "lam do an", "khoa luan", "aip491", "ojt202", "xet tot nghiep"]):
        r = call("check_ojt_and_graduation_eligibility", adv.check_ojt_and_graduation_eligibility())
        ojt = r["ojt_eligibility"]
        cap = r["capstone_and_graduation"]
        ojt_badge = "✅ ĐỦ ĐIỀU KIỆN" if ojt["is_eligible_now"] else ("⏳ DỰ KIẾN ĐỦ (nếu qua hết môn kỳ này)" if ojt["is_eligible_if_pass_studying"] else "❌ CHƯA ĐỦ ĐIỀU KIỆN")
        cap_badge = "✅ ĐỦ ĐIỀU KIỆN" if cap["eligible_for_capstone_AIP491"] else "⏳ CHƯA ĐỦ ĐIỀU KIỆN"
        return (f"🏢 **1. Điều kiện Thực tập doanh nghiệp (OJT202):** {ojt_badge}\n"
                f"- Tín chỉ giai đoạn Kỳ 1–5 đã tích lũy: **{ojt['pre_ojt_credits_passed']}/{ojt['pre_ojt_credits_total']} TC ({ojt['current_percentage']}%)** *(Yêu cầu >= 90%)*\n"
                f"- Dự kiến sau khi hoàn thành các môn đang học kỳ này: **{ojt['projected_percentage_after_this_term']}%**\n\n"
                f"🎓 **2. Điều kiện Khóa luận tốt nghiệp (AIP491) & Xét tốt nghiệp:** {cap_badge}\n"
                f"- Tổng tín chỉ tích lũy toàn khóa: **{cap['total_credits_passed']}/{cap['total_credits_required']} TC**\n"
                f"- Môn đang nợ cần trả: **{', '.join(cap['pending_failed_subjects']) if cap['pending_failed_subjects'] else 'Không nợ môn nào'}**\n"
                f"- Điều kiện bắt buộc khác: {', '.join(cap['mandatory_non_gpa_checklist'])}."), log

    if "gpa" in n or "diem trung binh" in n:
        m = re.search(r"(?:muc tieu|dat|target|muon|can)\D{0,10}(\d+(?:[.,]\d+)?)", n) or re.search(r"(\d+(?:[.,]\d+)?)\D{0,10}(?:muc tieu|target|gpa)", n)
        if m and any(k in n for k in ["muc tieu", "target", "can", "muon", "de duoc"]):
            r = call("plan_target_gpa", adv.plan_target_gpa(float(m.group(1).replace(",", "."))))
            return (f"🎯 Để đạt GPA **{r['target_gpa']}**, bạn cần trung bình **{r.get('required_average_on_remaining')}** "
                    f"trên {r.get('credits_remaining')} tín chỉ còn lại → *{r.get('verdict')}*."), log
        r = call("calculate_gpa", adv.gpa(_sem(text)))
        s = f"📊 **GPA {r['scope']}: {r['gpa']}** ({r['classification']}) – {r['credits_counted']} tín chỉ."
        if r.get("by_semester"):
            s += "\n\n" + "\n".join(f"- Kỳ {k}: {v}" for k, v in r["by_semester"].items())
        return s, log
    if any(k in n for k in ["hoc lai", "truot", "no mon"]) and any(k in n for k in ["phi", "tien", "bao nhieu"]):
        r = call("calculate_retake_fee", adv.retake_fee(subj))
        if "error" in r or not r["items"]:
            return r.get("error", "🎉 Bạn không có môn nào đang nợ."), log
        lines = [f"- **{i['subject_code']}** ({i['credits']} TC, trượt kỳ {i['failed_in_semester']}): "
                 f"{vnd(i['fee_applied'])} – {'học lại sớm 50%' if i['is_early_retake'] else 'thông thường 100%'}"
                 for i in r["items"]]
        return f"💸 Học phí học lại ({r['campus']}, kỳ {r['items'][0]['retake_in_semester']}):\n" + "\n".join(lines) + f"\n\n**Tổng: {vnd(r['total'])}**", log
    if subj and not any(k in n for k in ["phi", "tien ", "diem", "gpa"]):  # hỏi về 1 môn cụ thể -> kiểm tra tiên quyết
        r = call("check_prerequisites", adv.check_prerequisites(subj))
        if not r["prerequisites"]:
            return f"✅ **{r['subject_code']}** không có môn tiên quyết.", log
        lines = [f"- {p['prerequisite']}: {p['state']} {'✅' if p['met'] else '❌'}" for p in r["prerequisites"]]
        return (f"{'✅ Đủ' if r['can_register'] else '❌ Chưa đủ'} điều kiện học **{r['subject_code']} – {r['name']}**\n"
                + "\n".join(lines)), log
    if any(k in n for k in ["goi y", "ky sau", "ky toi", "nen hoc", "dang ky mon", "mon tiep"]):
        r = call("suggest_next_subjects", adv.suggest_next())
        rec = "\n".join(f"- {i['subject_code']} – {i['name']}" + (" *(học lại)*" if i["retake"] else "")
                        for i in r["recommended_next_semester"]) or "- (không có)"
        blk = "\n".join(f"- {i['subject_code']}: thiếu {', '.join(i['missing'])}" for i in r["blocked_by_prerequisites"][:6]) or "- (không có)"
        return f"📚 **Nên đăng ký:**\n{rec}\n\n⛔ **Đang bị chặn:**\n{blk}", log
    if any(k in n for k in ["tien do", "tot nghiep", "con thieu", "tin chi"]):
        r = call("get_study_progress", adv.progress())
        return (f"🎓 Đã qua **{r['credits_passed']}/{r['credits_total']}** tín chỉ ({r['percent']}%). "
                f"Đang học {len(r['studying'])} môn, nợ {len(r['failed_pending_retake'])} môn, "
                f"chưa học {len(r['not_taken_yet'])} môn."), log
    if any(k in n for k in ["bang diem", "transcript", "diem cua"]):
        r = call("get_transcript", adv.transcript(_sem(text)))
        return "\n".join(f"- Kỳ {x['semester']} | {x['subject_code']} | {x['grade']} | {x['status']}" for x in r["rows"]), log
    m = re.search(r"vang\D{0,15}(\d+)\D{1,20}(\d+)", n) or re.search(r"(\d+)\D{1,15}(?:slot|buoi)\D{0,20}vang\D{0,10}(\d+)", n)
    if "vang" in n and m:
        a, b = sorted(map(int, m.groups()), reverse=True)
        r = call("check_attendance", adv.check_attendance(a, b))
        return (f"{'🚨 Đã AF' if r['attendance_fail'] else '✅ An toàn'}: vắng {r['absent_percent']}% – tối đa được vắng "
                f"{r['max_absent_allowed']} buổi, còn dư {r['remaining_absences']} buổi."), log
    # 1. Câu hỏi về Đơn từ FAP (NVQS, tạm hoãn nghĩa vụ quân sự, thủ tục đơn từ, chuyển ngành, học võ sang cờ...)
    if any(k in n for k in ["don tu", "thu tuc don", "xin don", "giay xin", "nghia vu quan su", "nvqs", "tam hoan", "vo sang co", "hoc vo", "hoc co", "combo chuyen sau", "ks57", "bhyt", "chuyen co so"]):
        r = call("get_fap_application_procedure", adv.get_application_procedure(text))
        if "specific_application" in r:
            spec = r["specific_application"]
            gen = r.get("general_procedure", "")
            return (f"📝 **{spec['name']}**\n\n"
                    f"**Hướng dẫn thực hiện:**\n{spec['steps']}\n\n"
                    f"💡 *Lưu ý quy trình chung:* Em lên FAP, vào mục Đơn từ/Thủ tục sinh viên, gửi đơn, chờ trạng thái chuyển sang Chấp nhận (Approved) rồi mang thẻ sinh viên lên Phòng Dịch vụ sinh viên (DVSV) nhận bản cứng."), log
        if "matched_applications" in r:
            lines = [f"{a['id']}. **{a['name']}**: {a.get('note', '')}" for a in r["matched_applications"][:10]]
            return (f"📋 **Các loại đơn từ trên FAP:**\n\n" + "\n".join(lines) + 
                    f"\n\n👉 **Quy trình:** {r.get('general_procedure', 'Lên FAP làm đơn -> Chờ duyệt -> Lên phòng DVSV lấy kết quả.')}"), log

    # 2. Câu hỏi về Thời khóa biểu (TKB)
    if any(k in n for k in ["thoi khoa bieu", "tkb", "lich hoc", "lich trong tuan", "hom nay hoc gi", "thu 2 hoc gi", "thu hai hoc gi"]):
        r = call("get_student_schedule", adv.get_schedule())
        if "schedule" in r:
            lines = [f"📅 **Thời khóa biểu tuần ({r.get('week', '')}):**\n"]
            for slot_item in r["schedule"]:
                slot_num = slot_item["slot"]
                slot_time = slot_item["time"]
                lines.append(f"**Slot {slot_num} ({slot_time}):**")
                for day, info in slot_item["days"].items():
                    if info:
                        lines.append(f"  - **{day}**: môn **{info['subject_code']}** ({info['class_name']}), Phòng **{info['room']}**, GV **{info['lecturer']}** [{info['type']}] - *Trạng thái: {info['status']}*")
            return "\n".join(lines), log

    # 3. Câu hỏi về Điểm danh chi tiết
    if ("diem danh" in n or "tinh hinh diem danh" in n or "da vang may buoi" in n or "nguy co af" in n or "cam thi" in n) and not m:
        r = call("get_attendance_details", adv.get_attendance_details(subj))
        if "records" in r:
            absent_sessions = [f"Buổi {rec['session']} ({rec.get('date', '')})" for rec in r.get("records", []) if rec.get("status") == "Vắng mặt"]
            absent_str = ", ".join(absent_sessions) if absent_sessions else "Không có buổi nào vắng"
            
            status_badge = "🚨 **TRẠNG THÁI: BỊ CẤM THI (ATTENDANCE FAIL - AF)**" if r.get("is_attendance_fail") else "⚠️ **TRẠNG THÁI: ĐANG HỌC (CHƯA BỊ CẤM THI)**"
            
            rec_summary = (f"📋 **Tình hình điểm danh môn {r['subject_code']} – {r['subject_name']} ({r.get('class_name', '')}):**\n"
                           f"{status_badge}\n\n"
                           f"- Giảng viên: **{r.get('lecturer', 'Chưa rõ')}**\n"
                           f"- Tổng số buổi học: **{r['total_slots']} buổi**\n"
                           f"- Đã học: **{r['current_slot']} buổi** (Có mặt: **{r['attended_slots']}**, Vắng mặt: **{r['absent_slots']}**)\n"
                           f"- Tỷ lệ vắng trên tổng số buổi: **{r['absent_rate_total']}**\n"
                           f"- Mức vắng tối đa cho phép: **{r['max_allowed_absent']} buổi** (20%)\n"
                           f"- Số buổi vắng còn lại cho phép: **{r['remaining_allowed_absent']} buổi**\n\n"
                           f"📢 **Kết luận học vụ:**\n{r['warning_status']}\n\n"
                           f"📌 *Các buổi đã vắng:* {absent_str}.")
            return rec_summary, log

    r = call("search_policy", {"results": search_policy(text)})
    if not r["results"]:
        return "Mình chưa tìm thấy quy chế phù hợp. Bạn hỏi lại cụ thể hơn hoặc liên hệ Phòng Dịch vụ sinh viên nhé.", log
    top = r["results"][0]
    return f"📖 **{top['title']}**\n\n{top['content']}", log
