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

    if "gpa" in n or "diem trung binh" in n:
        m = re.search(r"(?:muc tieu|dat|target)\D{0,10}(\d+(?:[.,]\d+)?)", n)
        if m and ("muc tieu" in n or "target" in n or "can" in n):
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
    r = call("search_policy", {"results": search_policy(text)})
    if not r["results"]:
        return "Mình chưa tìm thấy quy chế phù hợp. Bạn hỏi lại cụ thể hơn hoặc liên hệ Phòng Dịch vụ sinh viên nhé.", log
    top = r["results"][0]
    return f"📖 **{top['title']}**\n\n{top['content']}", log
