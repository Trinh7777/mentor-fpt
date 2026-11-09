/**
 * Local Instant Analyzer over Parallel-Crawled FAP Snapshot
 * Cho phép hiển thị tức thì GPA, Điểm thành phần, Cần thi FE bao nhiêu, Điểm danh AF đa môn
 * và trả lời câu hỏi cục bộ ngay cả khi người dùng chưa bật server Python ở cổng 8000!
 */

const NON_GPA = new Set(["OJT202", "VOV114", "VOV124", "VOV134", "TRS601", "GDQP"]);

export function classifyGpa(gpa) {
  if (gpa == null || isNaN(gpa)) return "Chưa tính";
  if (gpa >= 9.0) return "Xuất sắc";
  if (gpa >= 8.0) return "Giỏi";
  if (gpa >= 7.0) return "Khá";
  if (gpa >= 6.0) return "TB Khá";
  if (gpa >= 5.0) return "Trung bình";
  return "Yếu";
}

export function calcRequiredFeLocal(cwAvg, feWeight = 0.4, targetTotal = 5.0, minFe = 4.0) {
  if (cwAvg == null || isNaN(cwAvg)) return null;
  const fw = feWeight > 1 ? feWeight / 100 : feWeight || 0.4;
  if (fw <= 0) return { required_fe: 0, verdict: "Môn đồ án / không thi FE" };
  const cwWeight = 1 - fw;
  const rawNeed = (Math.max(targetTotal, 5.0) - cwAvg * cwWeight) / fw;
  const req = Math.round(Math.max(rawNeed, minFe) * 100) / 100;
  let verdict = "Khả thi";
  if (req > 10) verdict = "Không thể đạt (>10)";
  else if (req <= minFe && rawNeed <= minFe) verdict = `Rất an toàn (chỉ cần >= ${minFe})`;
  else if (req <= 6.5) verdict = "Trong tầm tay";
  else if (req <= 8.5) verdict = "Cần ôn kỹ";
  else verdict = "Báo động đỏ!";
  return {
    required_fe: req,
    cw_points: Math.round(cwAvg * cwWeight * 100) / 100,
    fe_weight_pct: Math.round(fw * 100),
    cw_weight_pct: Math.round(cwWeight * 100),
    verdict,
  };
}

export function buildMetricsFromSnapshot(snapshot) {
  if (!snapshot) return null;
  const rows = snapshot.transcript || [];
  const latestMap = {};
  rows.forEach((r, idx) => {
    const k = r.subject_code;
    if (!latestMap[k] || r.semester_taken >= latestMap[k].semester_taken) {
      latestMap[k] = { ...r, _i: idx };
    }
  });

  const latest = Object.values(latestMap);
  const graded = latest.filter(
    (r) =>
      r.grade != null &&
      (r.status === "Passed" || r.status === "Failed") &&
      !NON_GPA.has(r.subject_code)
  );
  const gpaCredits = graded.reduce((acc, r) => acc + (r.credits || 3), 0);
  const gpaPoints = graded.reduce((acc, r) => acc + r.grade * (r.credits || 3), 0);
  const gpa = gpaCredits > 0 ? Math.round((gpaPoints / gpaCredits) * 100) / 100 : null;

  const passed = latest.filter((r) => r.status === "Passed");
  const studying = latest.filter((r) => r.status === "Studying");
  const failed = latest.filter((r) => r.status === "Failed");
  const creditsPassed = passed.reduce((acc, r) => acc + (r.credits || 3), 0);

  const cwObj = snapshot.component_grades || {};
  const courseworkList = Object.values(cwObj).map((c) => {
    const passCalc = calcRequiredFeLocal(c.coursework_average, c.fe_weight, 5.0);
    const goodCalc = calcRequiredFeLocal(c.coursework_average, c.fe_weight, 8.0);
    return {
      ...c,
      required_fe_to_pass: passCalc ? passCalc.required_fe : null,
      required_fe_for_good: goodCalc ? goodCalc.required_fe : null,
      fe_verdict: passCalc ? passCalc.verdict : "Đang cập nhật",
    };
  });

  const attCourses = [...(snapshot.attendances_multi || [])].sort((a, b) => {
    if (Boolean(a.is_attendance_fail) !== Boolean(b.is_attendance_fail)) {
      return a.is_attendance_fail ? -1 : 1;
    }
    return (a.remaining_allowed_absent ?? 99) - (b.remaining_allowed_absent ?? 99);
  });

  return {
    student_id: snapshot.student_id,
    full_name: snapshot.full_name,
    major: snapshot.major || "FPT University",
    campus: snapshot.campus || "Hà Nội",
    current_semester: snapshot.current_semester || 5,
    gpa,
    classification: classifyGpa(gpa),
    gpaCredits,
    creditsPassed,
    passedCount: passed.length,
    studying,
    failed,
    courseworkList,
    attCourses,
    schedule: snapshot.schedule,
    transcriptRows: rows,
  };
}

export function answerLocallyFromSnapshot(prompt, snapshot) {
  const m = buildMetricsFromSnapshot(snapshot);
  if (!m) {
    return "Chưa có dữ liệu FAP. Bạn hãy bấm **⚡ Kéo song song** ở thanh trên cùng nhé!";
  }

  const q = (prompt || "").toLowerCase();

  if (q.includes("fe") || q.includes("thành phần") || q.includes("quá trình") || q.includes("qua môn")) {
    if (m.courseworkList.length === 0) {
      return "Hiện chưa phát hiện bảng điểm thành phần kỳ này trên FAP.";
    }
    const lines = m.courseworkList.map(
      (c) =>
        `- **${c.subject_code} (${c.subject_name})**: TB quá trình **\`${c.coursework_average ?? "--"}\`** (FE ${Math.round(
          (c.fe_weight || 0.4) * 100
        )}%) → Cần FE >= **\`${c.required_fe_to_pass}\`** để Qua môn | >= **\`${c.required_fe_for_good}\`** để đạt Giỏi (*${c.fe_verdict}*)`
    );
    return `🎯 **Phân tích Điểm thành phần & Mục tiêu FE trực tiếp từ FAP (${m.student_id}):**\n\n${lines.join(
      "\n"
    )}\n\n*(Lưu ý quy chế FPTU: Tổng kết >= 5.0 và FE >= 4.0 không bị điểm liệt).*`;
  }

  if (q.includes("điểm danh") || q.includes("vắng") || q.includes("af") || q.includes("cấm thi")) {
    if (m.attCourses.length === 0) {
      return "Chưa có dữ liệu điểm danh các lớp trong học kỳ hiện tại.";
    }
    const lines = m.attCourses.map((c) => {
      const tag = c.is_attendance_fail
        ? "🚨 **ĐÃ CẤM THI (AF)**"
        : c.remaining_allowed_absent <= 1
        ? `⚠️ **Còn phép nghỉ ${c.remaining_allowed_absent} buổi**`
        : `✅ An toàn (còn ${c.remaining_allowed_absent} buổi)`;
      return `- **${c.subject_code}** (${c.class_name}): Đã vắng **${c.absent_slots}/${c.total_slots}** slot (${c.absent_rate_total}) → ${tag}`;
    });
    return `📋 **Báo cáo Điểm danh Đa môn từ FAP (${m.attCourses.length} lớp):**\n\n${lines.join("\n")}`;
  }

  if (q.includes("lịch") || q.includes("thời khóa biểu") || q.includes("tkb")) {
    const sched = m.schedule?.schedule || [];
    if (!sched.length) return "Chưa có lịch học tuần này trên FAP.";
    const lines = [];
    sched.forEach((s) => {
      Object.entries(s.days || {}).forEach(([day, info]) => {
        if (info) {
          lines.push(
            `- **${day} · Slot ${s.slot} (${s.time})**: **${info.subject_code}** tại phòng **${info.room}** (GV: ${info.lecturer}) — *${info.status}*`
          );
        }
      });
    });
    return `📅 **Thời khóa biểu tuần hiện tại từ FAP:**\n\n${lines.join("\n")}`;
  }

  const failNote =
    m.failed.length > 0
      ? `Đang nợ **${m.failed.length} môn** (${m.failed.map((x) => x.subject_code).join(", ")})`
      : "Không nợ môn nào 🎉";

  return (
    `📊 **Tổng quan Học vụ FAP của ${m.full_name} (${m.student_id}):**\n\n` +
    `- **GPA tích lũy:** **${m.gpa ?? "--"}** (${m.classification}) trên ${m.gpaCredits} tín chỉ\n` +
    `- **Tín chỉ đã qua:** **${m.creditsPassed} TC** (${m.passedCount} môn) · Đang học: **${m.studying.length} môn**\n` +
    `- **Tình trạng nợ môn:** ${failNote}\n` +
    `- **Điểm danh kỳ này:** Đã quét song song **${m.attCourses.length} lớp**, phát hiện **${
      m.attCourses.filter((x) => x.is_attendance_fail).length
    } lớp AF**.\n\n` +
    `💡 *Bật \`python server.py\` (cổng 8000) để kích hoạt đầy đủ Gemini LLM Streaming + lưu lịch sử SQLite!*`
  );
}
