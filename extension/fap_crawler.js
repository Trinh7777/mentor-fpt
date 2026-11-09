/**
 * UniFs Pro — Dual-Engine FAP Crawler (fap_crawler.js)
 * Hỗ trợ song song CẢ 2 THẾ HỆ CỔNG ĐÀO TẠO FAP:
 *   1. Giao diện FAP 2.0 SPA mới (https://fap.fpt.edu.vn — React/Next/Vue SPA tiếng Việt:
 *      "Lịch học", "Báo cáo học tập", "Môn học & chương trình", "Khung chương trình"...):
 *      -> Tự động bắt 100% gói JSON API từ fap_page_hook.js + quét DOM tiếng Việt/Anh +
 *         nạp song song các route học vụ mà KHÔNG gọi link .aspx cũ (0% lỗi HTTP 404!).
 *   2. Giao diện FAP Classic ASP.NET (.aspx) & Local Testbed (/fap-simulator/*.aspx):
 *      -> Chạy 5 luồng Promise.allSettled kéo song song toàn bộ các trang .aspx.
 */

(function () {
  const ROLL_REGEX = /\b([A-Z]{2}\d{5,8})\b/;
  const CODE_REGEX = /\b([A-Z]{2,4}\d{3}[a-zA-Z0-9]*)\b/;
  const STRICT_CODE_REGEX = /^[A-Z]{2,4}\d{3}[a-zA-Z0-9]{0,2}$/;

  // Bộ nhớ tích lũy liên tục trong phiên mở tab FAP 2.0 SPA
  const spaStore = {
    profile: {
      student_id: "",
      full_name: "",
      email: "",
      major: "",
      current_semester: null,
      campus: "Hà Nội",
    },
    transcriptMap: new Map(), // key: CODE_SEM -> record
    subjectsMap: new Map(), // key: CODE -> subject meta
    courseworkMap: {}, // code -> component grade object
    attendanceMap: {}, // code -> attendance course object
    scheduleSlotsMap: new Map(), // slotNum -> { slot, time, days }
  };

  function getPortalContext() {
    const pathname = window.location.pathname || "";
    const isSimulator = pathname.startsWith("/fap-simulator");
    const hasClassicAspxDom =
      isSimulator ||
      pathname.toLowerCase().endsWith(".aspx") ||
      Boolean(document.querySelector("#ctl00_lblLogIn, form[action*='.aspx']"));
    const basePrefix = isSimulator ? "/fap-simulator" : "";
    const urlParams = new URLSearchParams(window.location.search);
    const simSid = isSimulator ? urlParams.get("sid") : null;
    return {
      isSimulator,
      isClassicAspx: hasClassicAspxDom,
      basePrefix,
      simSid,
      origin: window.location.origin,
    };
  }

  function mapCampusName(rawText) {
    const t = String(rawText || "").toLowerCase();
    if (t.includes("hồ chí minh") || t.includes("ho chi minh") || t.includes("hcm") || t.includes("q9")) return "TP.HCM";
    if (t.includes("đà nẵng") || t.includes("da nang") || t.includes("dn")) return "Đà Nẵng";
    if (t.includes("cần thơ") || t.includes("can tho") || t.includes("ct")) return "Cần Thơ";
    if (t.includes("quy nhơn") || t.includes("quy nhon") || t.includes("qn")) return "Quy Nhơn";
    return "Hà Nội";
  }

  function normalizeStudyStatus(rawStatus, gradeVal) {
    const s = String(rawStatus ?? "").trim().toLowerCase();
    if (
      s === "passed" ||
      s === "pass" ||
      s === "đạt" ||
      s === "qua môn" ||
      s === "hoàn thành" ||
      s === "completed" ||
      s === "true"
    ) {
      return "Passed";
    }
    if (
      s.includes("not pass") ||
      s.includes("fail") ||
      s.includes("không đạt") ||
      s.includes("chưa đạt") ||
      s.includes("trượt") ||
      s.includes("học lại") ||
      s === "af"
    ) {
      return "Failed";
    }
    if (
      s.includes("not start") ||
      s.includes("chưa học") ||
      s.includes("chưa bắt đầu") ||
      s.includes("upcoming")
    ) {
      return "NotStarted";
    }
    if (s.includes("study") || s.includes("đang học") || s.includes("in progress") || s.includes("enrolled")) {
      return "Studying";
    }
    if (gradeVal !== null && gradeVal !== undefined && !isNaN(gradeVal)) {
      return Number(gradeVal) >= 5.0 ? "Passed" : "Failed";
    }
    return "Studying";
  }

  function pickField(obj, keys) {
    if (!obj || typeof obj !== "object") return undefined;
    for (const k of keys) {
      if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
        return obj[k];
      }
    }
    const lowerMap = {};
    for (const actualKey of Object.keys(obj)) {
      lowerMap[actualKey.toLowerCase()] = obj[actualKey];
    }
    for (const k of keys) {
      const v = lowerMap[k.toLowerCase()];
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  }

  // =========================================================================
  // PHẦN A: BỘ GIẢI MÃ JSON API & DOM TỰ ĐỘNG CHO FAP 2.0 SPA MỚI
  // =========================================================================

  function tryExtractProfileFromObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;

    const rawRoll = pickField(obj, [
      "rollNumber",
      "studentCode",
      "studentId",
      "student_id",
      "mssv",
      "userCode",
      "username",
      "code",
    ]);
    if (rawRoll && typeof rawRoll === "string") {
      const m = rawRoll.toUpperCase().match(ROLL_REGEX);
      if (m && !spaStore.profile.student_id) {
        spaStore.profile.student_id = m[1];
      }
    }

    const rawEmail = pickField(obj, ["email", "fptEmail", "studentEmail", "upn", "unique_name"]);
    if (rawEmail && typeof rawEmail === "string" && rawEmail.includes("@")) {
      spaStore.profile.email = rawEmail.trim();
      if (!spaStore.profile.student_id) {
        const m = rawEmail.toUpperCase().match(/([A-Z]{2}\d{5,8})@/);
        if (m) spaStore.profile.student_id = m[1];
      }
    }

    const rawName = pickField(obj, [
      "fullName",
      "full_name",
      "studentName",
      "displayName",
      "hoTen",
      "given_name",
      "name",
    ]);
    if (
      rawName &&
      typeof rawName === "string" &&
      rawName.length >= 3 &&
      rawName.length <= 60 &&
      !STRICT_CODE_REGEX.test(rawName.trim()) &&
      !rawName.toLowerCase().includes("sinh viên ")
    ) {
      // Chỉ nhận name nếu object này cũng chứa thông tin user/student để tránh nhầm tên môn học
      if (rawRoll || rawEmail || pickField(obj, ["major", "campus", "rollNumber", "mssv", "family_name"])) {
        spaStore.profile.full_name = rawName.trim();
      }
    }

    const rawMajor = pickField(obj, [
      "major",
      "majorName",
      "specialization",
      "specializationName",
      "chuyenNganh",
      "nganhHoc",
      "curriculumName",
    ]);
    if (rawMajor && typeof rawMajor === "string" && rawMajor.length >= 2) {
      spaStore.profile.major = rawMajor.trim();
    }

    const rawSem = pickField(obj, ["currentTerm", "currentSemester", "current_semester", "termNo", "hocKyHienTai"]);
    if (rawSem !== undefined) {
      const n = parseInt(String(rawSem).replace(/\D/g, ""), 10);
      if (!isNaN(n) && n >= 1 && n <= 12) spaStore.profile.current_semester = n;
    }

    const rawCampus = pickField(obj, ["campusName", "campus", "campusCode", "coSo"]);
    if (rawCampus && typeof rawCampus === "string") {
      spaStore.profile.campus = mapCampusName(rawCampus);
    }
  }

  function tryExtractAcademicArrays(arr, urlHint = "") {
    if (!Array.isArray(arr) || arr.length === 0) return;
    const sample = arr.find((x) => x && typeof x === "object" && !Array.isArray(x));
    if (!sample) return;

    const lowerUrl = String(urlHint || "").toLowerCase();

    // 1. Kiểm tra mảng Thời khóa biểu / Lịch học (có slot + date/day + subjectCode)
    const hasSlot = pickField(sample, ["slot", "slotNo", "slotNumber", "slotId", "caHoc", "timeSlot"]) !== undefined;
    const hasDateOrDay =
      pickField(sample, ["date", "studyDate", "activityDate", "dayOfWeek", "ngayHoc", "startTime"]) !== undefined;
    const hasSubj =
      pickField(sample, ["subjectCode", "courseCode", "subject_code", "maMon", "subject"]) !== undefined;

    if (hasSlot && hasDateOrDay && hasSubj && (lowerUrl.includes("schedule") || lowerUrl.includes("timetable") || lowerUrl.includes("lich") || pickField(sample, ["room", "roomNo", "roomName", "phong"]) !== undefined)) {
      const dayNamesVi = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
      const defaultTimes = {
        1: "07:30-09:50",
        2: "10:00-12:20",
        3: "12:50-15:10",
        4: "15:20-17:40",
        5: "18:00-20:20",
      };
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const rawCode = String(
          pickField(item, ["subjectCode", "courseCode", "subject_code", "maMon", "subject"]) || ""
        ).trim();
        const codeM = rawCode.match(CODE_REGEX);
        if (!codeM) continue;

        const rawSlot = pickField(item, ["slot", "slotNo", "slotNumber", "slotId", "caHoc", "timeSlot"]);
        const slotNum = parseInt(String(rawSlot).replace(/\D/g, ""), 10) || 1;
        const rawDate = pickField(item, ["date", "studyDate", "activityDate", "ngayHoc", "startTime"]);
        let dayLabel = "Thứ 2";
        if (rawDate) {
          const d = new Date(rawDate);
          if (!isNaN(d.getTime())) {
            dayLabel = dayNamesVi[d.getDay()];
          }
        }

        if (!spaStore.scheduleSlotsMap.has(slotNum)) {
          spaStore.scheduleSlotsMap.set(slotNum, {
            slot: slotNum,
            time: String(pickField(item, ["slotTime", "timeRange", "time"]) || defaultTimes[slotNum] || ""),
            days: {
              "Thứ 2": null,
              "Thứ 3": null,
              "Thứ 4": null,
              "Thứ 5": null,
              "Thứ 6": null,
              "Thứ 7": null,
              "Chủ nhật": null,
            },
          });
        }
        const attSt = String(pickField(item, ["attendanceStatus", "status", "trangThaiDiemDanh"]) || "").toLowerCase();
        let viAtt = "Chưa học";
        if (attSt.includes("present") || attSt.includes("attended") || attSt.includes("có mặt") || attSt === "1") {
          viAtt = "Có mặt";
        } else if (attSt.includes("absent") || attSt.includes("vắng") || attSt === "2") {
          viAtt = "Vắng mặt";
        }

        spaStore.scheduleSlotsMap.get(slotNum).days[dayLabel] = {
          subject_code: codeM[1],
          room: String(pickField(item, ["room", "roomNo", "roomName", "phong", "phongHoc"]) || "FPT"),
          class_name: String(pickField(item, ["className", "groupName", "classCode", "lop"]) || "FAP"),
          lecturer: String(pickField(item, ["lecturer", "lecturerCode", "teacher", "giangVien"]) || "FPTU"),
          type: String(pickField(item, ["type", "studyType"]) || "Offline"),
          status: viAtt,
        };
      }
    }

    // 2. Kiểm tra mảng Tóm tắt Điểm danh đa môn (có absentSlots / totalSlots + subjectCode)
    if (
      hasSubj &&
      pickField(sample, ["absentSlots", "absentCount", "totalAbsent", "soBuoiVang", "absentPercent"]) !== undefined
    ) {
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const rawCode = String(
          pickField(item, ["subjectCode", "courseCode", "subject_code", "maMon", "subject"]) || ""
        ).trim();
        const codeM = rawCode.match(CODE_REGEX);
        if (!codeM) continue;
        const code = codeM[1];
        const totalSlots = parseInt(pickField(item, ["totalSlots", "totalSessions", "tongSoBuoi"]) || 20, 10) || 20;
        const absent = parseInt(pickField(item, ["absentSlots", "absentCount", "totalAbsent", "soBuoiVang"]) || 0, 10) || 0;
        const attended = parseInt(pickField(item, ["attendedSlots", "presentCount", "soBuoiCoMat"]) || 0, 10);
        const maxAllowed = Math.floor(totalSlots * 0.2);
        const remainAllowed = Math.max(maxAllowed - absent, 0);
        const isAf = absent > maxAllowed;
        const pctTotal = Math.round((100 * absent / Math.max(totalSlots, 1)) * 10) / 10;

        spaStore.attendanceMap[code] = {
          student_id: spaStore.profile.student_id || "FAP",
          subject_code: code,
          subject_name: String(pickField(item, ["subjectName", "courseName", "tenMon", "name"]) || code),
          class_name: String(pickField(item, ["className", "groupName", "lop"]) || "FAP"),
          lecturer: String(pickField(item, ["lecturer", "giangVien"]) || "FPTU"),
          total_slots: totalSlots,
          current_slot: attended + absent,
          attended_slots: attended,
          absent_slots: absent,
          absent_rate_current: `${pctTotal}%`,
          absent_rate_total: `${pctTotal}%`,
          max_allowed_absent: maxAllowed,
          remaining_allowed_absent: remainAllowed,
          is_attendance_fail: isAf,
          warning_status: isAf
            ? `🚨 ĐÃ BỊ CẤM THI (AF) MÔN ${code}! Đã vắng ${absent}/${totalSlots} buổi (${pctTotal}% > 20%).`
            : `✅ Đã vắng ${absent}/${totalSlots} buổi (${pctTotal}%), còn phép nghỉ ${remainAllowed} buổi.`,
          records: spaStore.attendanceMap[code]?.records || [],
        };
      }
    }

    // 3. Kiểm tra mảng Bảng điểm / Khung chương trình (có subjectCode + grade/status/credits/semester)
    const hasTranscriptSignals =
      hasSubj &&
      (pickField(sample, [
        "grade",
        "totalMark",
        "averageMark",
        "finalMark",
        "mark",
        "score",
        "gpa",
        "diem",
        "diemTongKet",
        "status",
        "studyStatus",
        "trangThai",
        "credits",
        "numberOfCredit",
        "soTinChi",
        "term",
        "termNo",
        "semester",
        "hocKy",
      ]) !== undefined);

    if (hasTranscriptSignals && !hasSlot) {
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const rawCode = String(
          pickField(item, ["subjectCode", "courseCode", "subject_code", "maMon", "code", "subject"]) || ""
        ).trim();
        const codeM = rawCode.match(CODE_REGEX);
        if (!codeM) continue;
        const code = codeM[1];

        const subjName = String(
          pickField(item, ["subjectName", "courseName", "subject_name", "tenMon", "tenHocPhan", "name"]) || code
        ).trim();
        const rawTerm = pickField(item, ["termNo", "term", "semester", "semesterTaken", "hocKy", "kyHoc"]);
        const semNum = Math.min(Math.max(parseInt(String(rawTerm ?? "1").replace(/[^\d]/g, ""), 10) || 1, 1), 9);
        const credits =
          parseInt(pickField(item, ["credits", "numberOfCredit", "credit", "soTinChi"]) ?? 3, 10) || 3;

        const rawGrade = pickField(item, [
          "grade",
          "totalMark",
          "averageMark",
          "finalMark",
          "mark",
          "score",
          "diem",
          "diemTongKet",
        ]);
        let gradeVal = null;
        if (rawGrade !== undefined && rawGrade !== null && rawGrade !== "") {
          const pg = parseFloat(String(rawGrade).replace(",", "."));
          if (!isNaN(pg) && pg >= 0 && pg <= 10) gradeVal = pg;
        }

        const rawSt = pickField(item, ["status", "studyStatus", "gradeStatus", "trangThai", "isPassed"]);
        const normStatus = normalizeStudyStatus(rawSt, gradeVal);

        // Luôn lưu vào danh mục môn học khám phá được (kể cả môn Chưa học trong Khung chương trình!)
        spaStore.subjectsMap.set(code, {
          subject_code: code,
          subject_name: subjName,
          semester: semNum,
          credits,
        });

        // Nếu môn Đã học / Đang học / Trượt -> đưa vào Bảng điểm sinh viên!
        if (normStatus !== "NotStarted" && (rawSt !== undefined || gradeVal !== null || lowerUrl.includes("transcript") || lowerUrl.includes("grade") || lowerUrl.includes("mark"))) {
          spaStore.transcriptMap.set(`${code}_${semNum}`, {
            subject_code: code,
            subject_name: subjName,
            semester_taken: semNum,
            credits,
            grade: gradeVal,
            status: normStatus,
          });
        }

        // Nếu object môn học chứa luôn mảng điểm thành phần con (assessments / gradeItems / marks)
        const subItems = pickField(item, ["gradeItems", "assessments", "marks", "components", "details", "chiTietDiem"]);
        if (Array.isArray(subItems) && subItems.length > 0) {
          ingestComponentItemsForCourse(code, subjName, subItems);
        }
      }
    }
  }

  function ingestComponentItemsForCourse(code, subjName, rawItems) {
    if (!code || !Array.isArray(rawItems)) return;
    const items = [];
    let feWeightPct = null;
    let feRecorded = null;

    for (const it of rawItems) {
      if (!it || typeof it !== "object") continue;
      const itemName = String(
        pickField(it, ["gradeItem", "itemName", "assessmentName", "name", "category", "tenDauDiem", "thanhPhan"]) || ""
      ).trim();
      const lower = itemName.toLowerCase();
      if (!itemName || lower.includes("total") || lower.includes("tổng") || lower.includes("resit")) continue;

      const rawW = pickField(it, ["weight", "weightPercent", "percent", "trongSo"]);
      if (rawW === undefined) continue;
      let wPct = parseFloat(String(rawW).replace("%", "").replace(",", "."));
      if (isNaN(wPct) || wPct <= 0) continue;
      if (wPct <= 1.0) wPct = wPct * 100;

      const rawVal = pickField(it, ["value", "mark", "score", "grade", "diem"]);
      let val = null;
      if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
        const pv = parseFloat(String(rawVal).replace(",", "."));
        if (!isNaN(pv) && pv >= 0 && pv <= 10) val = pv;
      }

      if (lower.includes("final exam") || lower === "fe" || lower.includes("thi cuối kỳ")) {
        feWeightPct = (feWeightPct || 0) + wPct;
        if (val !== null) feRecorded = val;
      } else {
        items.push({
          category: String(pickField(it, ["category", "gradeCategory", "nhom"]) || itemName),
          name: itemName,
          weight_pct: Math.round(wPct * 10) / 10,
          value: val,
        });
      }
    }

    if (items.length === 0 && feWeightPct === null) return;
    let wSum = 0;
    let wPts = 0;
    for (const x of items) {
      if (x.value !== null) {
        wSum += x.weight_pct;
        wPts += x.value * x.weight_pct;
      }
    }
    spaStore.courseworkMap[code] = {
      subject_code: code,
      subject_name: subjName || code,
      fe_weight: feWeightPct !== null ? Math.min(Math.round(feWeightPct) / 100, 0.8) : 0.4,
      fe_score_recorded: feRecorded,
      coursework_completed_weight_pct: Math.round(wSum * 10) / 10,
      coursework_average: wSum > 0 ? Math.round((wPts / wSum) * 100) / 100 : null,
      items,
    };
  }

  function ingestArbitraryJson(url, data, depth = 0) {
    if (!data || depth > 5) return;
    if (Array.isArray(data)) {
      tryExtractAcademicArrays(data, url);
      if (depth < 3) {
        for (const el of data.slice(0, 30)) {
          if (el && typeof el === "object") ingestArbitraryJson(url, el, depth + 1);
        }
      }
      return;
    }
    if (typeof data === "object") {
      tryExtractProfileFromObject(data);

      // Kiểm tra nếu object là chi tiết điểm thành phần của 1 môn
      const maybeCode = pickField(data, ["subjectCode", "courseCode", "maMon"]);
      const maybeItems = pickField(data, ["gradeItems", "assessments", "marks", "components", "chiTietDiem"]);
      if (maybeCode && Array.isArray(maybeItems)) {
        const cm = String(maybeCode).match(CODE_REGEX);
        if (cm) {
          ingestComponentItemsForCourse(
            cm[1],
            String(pickField(data, ["subjectName", "courseName", "tenMon"]) || cm[1]),
            maybeItems
          );
        }
      }

      for (const k of Object.keys(data)) {
        const val = data[k];
        if (val && typeof val === "object") {
          ingestArbitraryJson(url, val, depth + 1);
        }
      }
    }
  }

  // Quét các bảng & thẻ hiển thị trực tiếp trên DOM tiếng Việt / tiếng Anh của FAP 2.0 SPA
  function ingestFap2LiveDom(doc) {
    if (!doc || !doc.body) return;

    // 1. Nhận diện MSSV & Họ tên thật trên Header / Banner "Chào <Tên>" của FAP 2.0
    const bodyText = (doc.body.innerText || "").slice(0, 4000);
    if (!spaStore.profile.student_id) {
      const m = (doc.title + " " + bodyText).toUpperCase().match(ROLL_REGEX);
      if (m) spaStore.profile.student_id = m[1];
    }

    if (!spaStore.profile.full_name || spaStore.profile.full_name.startsWith("Sinh viên")) {
      const greetMatch = bodyText.match(/(?:Xin chào|Chào buổi [^\n,!]+\s*,?|Chào)\s+([A-ZÀ-Ỹ][a-zà-ỹ]+(?:\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){1,4})/);
      if (greetMatch && greetMatch[1]) {
        spaStore.profile.full_name = greetMatch[1].trim();
      }
    }

    // 2. Quét tất cả các bảng (HTML table + Antd/MUI table) có trên màn hình hiện tại
    const tables = Array.from(doc.querySelectorAll("table"));
    for (const table of tables) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;

      const headers = Array.from(rows[0].querySelectorAll("th, td")).map((c) =>
        c.textContent.replace(/\s+/g, " ").trim().toLowerCase()
      );

      // Bảng điểm / Khung chương trình tiếng Việt hoặc Anh
      const codeIdx = headers.findIndex(
        (h) => h.includes("mã môn") || h.includes("mã học phần") || h.includes("subject code") || h === "môn học"
      );
      const nameIdx = headers.findIndex(
        (h) => h.includes("tên môn") || h.includes("tên học phần") || h.includes("subject name")
      );
      const semIdx = headers.findIndex((h) => h === "kỳ" || h.includes("học kỳ") || h === "term" || h === "semester");
      const credIdx = headers.findIndex((h) => h.includes("tín chỉ") || h.includes("credit"));
      const gradeIdx = headers.findIndex(
        (h) => h === "điểm" || h.includes("điểm tb") || h.includes("tổng kết") || h.includes("grade") || h.includes("mark")
      );
      const statusIdx = headers.findIndex((h) => h.includes("trạng thái") || h.includes("status") || h.includes("kết quả"));

      if (codeIdx !== -1 && (nameIdx !== -1 || gradeIdx !== -1 || statusIdx !== -1)) {
        for (let i = 1; i < rows.length; i++) {
          const tds = Array.from(rows[i].querySelectorAll("td")).map((c) => c.textContent.trim());
          if (tds.length <= codeIdx) continue;
          const codeM = tds[codeIdx].match(CODE_REGEX);
          if (!codeM) continue;
          const code = codeM[1];
          const sName = nameIdx >= 0 && tds[nameIdx] ? tds[nameIdx] : code;
          const semNum = semIdx >= 0 ? Math.max(parseInt(tds[semIdx].replace(/\D/g, ""), 10) || 1, 1) : 1;
          const credits = credIdx >= 0 ? parseInt(tds[credIdx], 10) || 3 : 3;
          let grade = null;
          if (gradeIdx >= 0 && tds[gradeIdx] !== "") {
            const pg = parseFloat(tds[gradeIdx].replace(",", "."));
            if (!isNaN(pg) && pg >= 0 && pg <= 10) grade = pg;
          }
          const rawSt = statusIdx >= 0 ? tds[statusIdx] : "";
          const normSt = normalizeStudyStatus(rawSt, grade);

          spaStore.subjectsMap.set(code, {
            subject_code: code,
            subject_name: sName,
            semester: semNum,
            credits,
          });

          if (normSt !== "NotStarted" && (grade !== null || statusIdx !== -1)) {
            spaStore.transcriptMap.set(`${code}_${semNum}`, {
              subject_code: code,
              subject_name: sName,
              semester_taken: semNum,
              credits,
              grade,
              status: normSt,
            });
          }
        }
      }
    }
  }

  function buildSnapshotFromSpaStore(durationMs = 0) {
    const p = spaStore.profile;
    const transcript = Array.from(spaStore.transcriptMap.values());
    const subjects_discovered = Array.from(spaStore.subjectsMap.values());
    const component_grades = { ...spaStore.courseworkMap };
    const attendances_multi = Object.values(spaStore.attendanceMap);
    const schedList = Array.from(spaStore.scheduleSlotsMap.values()).sort((a, b) => a.slot - b.slot);

    return {
      student_id: p.student_id || "",
      full_name: p.full_name || "",
      email: p.email || (p.student_id ? `${p.student_id.toLowerCase()}@fpt.edu.vn` : ""),
      major: p.major || "",
      current_semester: p.current_semester || null,
      campus: p.campus || "Hà Nội",
      transcript,
      subjects_discovered,
      component_grades,
      schedule:
        schedList.length > 0
          ? {
              student_id: p.student_id || "FAP",
              full_name: p.full_name || "",
              week: `Đồng bộ FAP 2.0 (${new Date().toLocaleDateString("vi-VN")})`,
              schedule: schedList,
            }
          : null,
      attendances_multi,
      current_page: extractCurrentPageSummary(),
      portal_mode: "fap_v2_spa",
      crawl_duration_ms: durationMs,
      synced_at: new Date().toISOString(),
    };
  }

  // Nạp song song các đường dẫn <a href="/..."> học vụ trên FAP 2.0 bằng khung ẩn 1x1
  async function preloadSpaAcademicLinksInParallel() {
    const academicKeywords = [
      "lich-hoc",
      "schedule",
      "timetable",
      "bao-cao",
      "bang-diem",
      "transcript",
      "grade",
      "mark",
      "diem",
      "attend",
      "khung-chuong-trinh",
      "curriculum",
    ];
    const blockedKeywords = ["logout", "dang-xuat", "payment", "thanh-toan", "don", "wishlist"];

    const anchors = Array.from(document.querySelectorAll("a[href]"));
    const candidateUrls = [];
    const seen = new Set([window.location.pathname]);

    for (const a of anchors) {
      const href = a.getAttribute("href") || "";
      if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
      let u;
      try {
        u = new URL(href, window.location.origin);
      } catch {
        continue;
      }
      if (u.origin !== window.location.origin) continue;
      if (seen.has(u.pathname)) continue;

      const combined = (u.pathname + " " + (a.textContent || "")).toLowerCase();
      if (blockedKeywords.some((bk) => combined.includes(bk))) continue;
      if (academicKeywords.some((ak) => combined.includes(ak))) {
        seen.add(u.pathname);
        candidateUrls.push(u.toString());
      }
    }

    const targets = candidateUrls.slice(0, 4);
    if (targets.length === 0) return;

    await Promise.allSettled(
      targets.map(
        (targetUrl) =>
          new Promise((resolve) => {
            const ifr = document.createElement("iframe");
            ifr.style.cssText =
              "position:fixed;left:-9999px;top:-9999px;width:1024px;height:768px;opacity:0;pointer-events:none;";
            ifr.src = targetUrl;
            const cleanup = () => {
              try {
                if (ifr.contentDocument) ingestFap2LiveDom(ifr.contentDocument);
              } catch {
                // ignore
              }
              ifr.remove();
              resolve();
            };
            const timer = setTimeout(cleanup, 2600);
            ifr.addEventListener("load", () => {
              setTimeout(() => {
                clearTimeout(timer);
                cleanup();
              }, 1400);
            });
            document.body.appendChild(ifr);
          })
      )
    );
  }

  async function runFapV2SpaCrawl(onProgress, options = {}) {
    const t0 = performance.now();
    const emit = (worker, status, detail) => {
      if (typeof onProgress === "function") {
        onProgress({ worker, status, detail, timestamp: Date.now() });
      }
    };

    emit("profile", "running", "Đang đọc...");
    emit("transcript", "running", "Đang bắt API...");
    emit("coursework", "running", "Đang bắt API...");
    emit("schedule", "running", "Đang bắt API...");
    emit("attendance", "running", "Đang bắt API...");

    // Yêu cầu fap_page_hook.js gửi toàn bộ các gói JSON API & Storage đã bắt được
    window.postMessage({ source: "UNIFS_CONTENT_REQ", type: "REQUEST_HOOK_DUMP" }, "*");
    await new Promise((r) => setTimeout(r, 220));

    // Quét DOM hiện tại trên trang FAP 2.0
    ingestFap2LiveDom(document);

    // Nếu phát hiện link học vụ trên sidebar (<a href="...">), nạp song song trong nền!
    if (options.preloadLinks !== false && spaStore.transcriptMap.size === 0) {
      await preloadSpaAcademicLinksInParallel();
      await new Promise((r) => setTimeout(r, 200));
      ingestFap2LiveDom(document);
    }

    const snap = buildSnapshotFromSpaStore(Math.round(performance.now() - t0));

    emit("profile", snap.student_id ? "done" : "idle", snap.student_id || "Chờ nhận diện");
    emit(
      "transcript",
      snap.transcript.length > 0 ? "done" : "idle",
      snap.transcript.length > 0 ? `${snap.transcript.length} môn` : "Mở Báo cáo HT"
    );
    const cwCount = Object.keys(snap.component_grades || {}).length;
    emit("coursework", cwCount > 0 ? "done" : "idle", cwCount > 0 ? `${cwCount} lớp` : "Mở Điểm TP");
    emit(
      "schedule",
      snap.schedule ? "done" : "idle",
      snap.schedule ? `${snap.schedule.schedule.length} ca` : "Mở Lịch học"
    );
    emit(
      "attendance",
      snap.attendances_multi.length > 0 ? "done" : "idle",
      snap.attendances_multi.length > 0 ? `${snap.attendances_multi.length} lớp` : "Mở Điểm danh"
    );

    return snap;
  }

  // Lắng nghe gói JSON thời gian thực từ fap_page_hook.js (world: MAIN)
  const packetListeners = new Set();
  window.addEventListener("message", (evt) => {
    const msg = evt.data;
    if (!msg || msg.source !== "UNIFS_MAIN_HOOK") return;

    if (msg.type === "FAP_API_JSON" && msg.payload) {
      ingestArbitraryJson(msg.payload.url, msg.payload.data);
      const updated = buildSnapshotFromSpaStore(0);
      packetListeners.forEach((fn) => fn(updated));
    } else if (msg.type === "FAP_HOOK_DUMP" && msg.payload) {
      for (const item of msg.payload.storage || []) {
        ingestArbitraryJson(item.key, item.data);
      }
      for (const apiItem of msg.payload.apis || []) {
        ingestArbitraryJson(apiItem.url, apiItem.data);
      }
      const updated = buildSnapshotFromSpaStore(0);
      packetListeners.forEach((fn) => fn(updated));
    }
  });

  // =========================================================================
  // PHẦN B: BỘ QUÉT SONG SONG 5 LUỒNG CLASSIC .ASPX (/fap-simulator & .aspx)
  // =========================================================================

  function buildFapUrl(relPath) {
    const { basePrefix, simSid, origin } = getPortalContext();
    const u = new URL(basePrefix + relPath, origin);
    if (simSid && !u.searchParams.has("sid")) {
      u.searchParams.set("sid", simSid);
    }
    return u.toString();
  }

  function resolveHref(rawHref) {
    if (!rawHref || rawHref.startsWith("javascript:")) return null;
    const { simSid, origin } = getPortalContext();
    try {
      const u = new URL(rawHref, window.location.href);
      if (u.origin !== origin) return null;
      if (simSid && u.pathname.startsWith("/fap-simulator") && !u.searchParams.has("sid")) {
        u.searchParams.set("sid", simSid);
      }
      return u.toString();
    } catch {
      return null;
    }
  }

  async function fetchHtmlDoc(url) {
    const res = await fetch(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const html = await res.text();
    return new DOMParser().parseFromString(html, "text/html");
  }

  function extractIdentityFromDoc(doc) {
    if (!doc) return {};
    const loginBadge =
      doc.querySelector("#ctl00_lblLogIn")?.textContent?.trim() ||
      doc.querySelector("span[id*='lblLogIn']")?.textContent?.trim() ||
      "";
    const campusBadge =
      doc.querySelector("#ctl00_lblCampusName")?.textContent?.trim() ||
      doc.querySelector("span[id*='lblCampus']")?.textContent?.trim() ||
      "";

    let student_id = "";
    let full_name = "";

    if (loginBadge) {
      const m = loginBadge.match(ROLL_REGEX);
      if (m) student_id = m[1].toUpperCase();
      const cleanedName = loginBadge
        .replace(/\(.*?\)/g, "")
        .replace(ROLL_REGEX, "")
        .replace(/welcome|xin chào|logout|\|/gi, "")
        .trim();
      if (cleanedName && cleanedName.length >= 2) full_name = cleanedName;
    }

    if (!student_id) {
      const bodySample = (doc.title + " " + (doc.body?.innerText || "").slice(0, 2500)).toUpperCase();
      const m = bodySample.match(ROLL_REGEX);
      if (m) student_id = m[1].toUpperCase();
    }

    return {
      student_id,
      full_name,
      campus: campusBadge ? mapCampusName(campusBadge) : "",
    };
  }

  async function crawlProfileAspx() {
    const liveInfo = extractIdentityFromDoc(document);
    let doc = document;
    try {
      doc = await fetchHtmlDoc(buildFapUrl("/User/Profile.aspx"));
    } catch {
      doc = document;
    }

    const docInfo = extractIdentityFromDoc(doc);
    const out = {
      student_id: liveInfo.student_id || docInfo.student_id || "",
      full_name: liveInfo.full_name || docInfo.full_name || "",
      email: "",
      major: "",
      current_semester: null,
      campus: liveInfo.campus || docInfo.campus || "Hà Nội",
    };

    doc.querySelectorAll("table tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th, td")).map((c) => c.textContent.trim());
      if (cells.length < 2 || !cells[1]) return;
      const key = cells[0].toLowerCase();
      const val = cells[1];
      if ((key.includes("roll number") || key.includes("mssv")) && !out.student_id) {
        const m = val.toUpperCase().match(ROLL_REGEX);
        if (m) out.student_id = m[1];
      } else if (key.includes("full name") || key.includes("họ và tên")) {
        out.full_name = val;
      } else if (key.includes("email")) {
        out.email = val;
      } else if (key.includes("major") || key.includes("specialization")) {
        out.major = val;
      } else if (key.includes("current term") || key.includes("term")) {
        const num = parseInt(val.replace(/\D/g, ""), 10);
        if (!isNaN(num) && num >= 1 && num <= 12) out.current_semester = num;
      } else if (key.includes("campus")) {
        out.campus = mapCampusName(val);
      }
    });

    return out;
  }

  function parseTranscriptDoc(doc) {
    const records = [];
    const subjects_discovered = [];
    if (!doc) return { records, subjects_discovered };

    for (const table of Array.from(doc.querySelectorAll("table"))) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;
      const headerCells = Array.from(rows[0].querySelectorAll("th, td")).map((c) =>
        c.textContent.trim().toLowerCase()
      );
      const codeIdx = headerCells.findIndex((h) => h.includes("subject code") || h.includes("mã môn"));
      const statusIdx = headerCells.findIndex((h) => h.includes("status") || h.includes("trạng thái"));
      if (codeIdx === -1 || statusIdx === -1) continue;

      const termIdx = headerCells.findIndex((h) => h === "term" || h.includes("kỳ"));
      const nameIdx = headerCells.findIndex((h) => h.includes("subject name") || h.includes("tên môn"));
      const creditIdx = headerCells.findIndex((h) => h.includes("credit") || h.includes("tín chỉ"));
      const gradeIdx = headerCells.findIndex((h) => h.includes("grade") || h.includes("điểm"));

      for (let i = 1; i < rows.length; i++) {
        const tds = Array.from(rows[i].querySelectorAll("td")).map((c) => c.textContent.trim());
        if (tds.length <= Math.max(codeIdx, statusIdx)) continue;
        const rawCode = tds[codeIdx];
        if (!rawCode || rawCode.length < 3 || rawCode.toLowerCase().includes("subject")) continue;

        const termNum = Math.max(parseInt(String(termIdx >= 0 ? tds[termIdx] : "1").replace(/[^\d-]/g, ""), 10) || 1, 1);
        const subjName = nameIdx >= 0 && tds[nameIdx] ? tds[nameIdx] : rawCode;
        const credits = creditIdx >= 0 ? parseInt(tds[creditIdx], 10) || 3 : 3;

        let grade = null;
        if (gradeIdx >= 0 && tds[gradeIdx] !== "") {
          const parsedG = parseFloat(tds[gradeIdx].replace(",", "."));
          if (!isNaN(parsedG) && parsedG >= 0 && parsedG <= 10) grade = parsedG;
        }

        const status = normalizeStudyStatus(tds[statusIdx], grade);
        if (status === "NotStarted") continue;

        records.push({
          subject_code: rawCode,
          subject_name: subjName,
          semester_taken: termNum,
          credits,
          grade,
          status,
        });
        subjects_discovered.push({
          subject_code: rawCode,
          subject_name: subjName,
          semester: termNum,
          credits,
        });
      }
      if (records.length > 0) break;
    }
    return { records, subjects_discovered };
  }

  function extractCourseLinks(doc, pageKeyword) {
    const links = [];
    const seen = new Set();
    const anchors = Array.from(doc.querySelectorAll("#ctl00_mainContent_divCourse a, a[href*='course=']"));
    for (const a of anchors) {
      const rawHref = a.getAttribute("href") || "";
      if (pageKeyword && !rawHref.toLowerCase().includes(pageKeyword.toLowerCase()) && !rawHref.includes("course=")) {
        continue;
      }
      const fullUrl = resolveHref(rawHref);
      if (!fullUrl) continue;
      const text = a.textContent.trim();
      const codeMatch =
        text.match(/\(([A-Z]{2,4}\d{3}[a-zA-Z0-9]*)\)/) ||
        text.match(CODE_REGEX) ||
        fullUrl.match(/course=([A-Za-z0-9]+)/i);
      const code = codeMatch ? codeMatch[1] : "";
      const key = code || fullUrl;
      if (seen.has(key)) continue;
      seen.add(key);
      const cleanName = text.replace(/\(.*?\)/g, "").trim() || code;
      links.push({ code, name: cleanName, text, url: fullUrl });
    }
    return links.slice(0, 10);
  }

  function parseMarkReportTable(doc, fallbackCode, fallbackName) {
    const container = doc.querySelector("#ctl00_mainContent_divGrade") || doc;
    const table = container.querySelector("table");
    if (!table) return null;
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) return null;

    let currentCategory = "";
    const items = [];
    let feWeightPct = null;
    let feRecordedScore = null;

    for (let i = 1; i < rows.length; i++) {
      const tds = Array.from(rows[i].querySelectorAll("td")).map((c) => c.textContent.trim());
      if (tds.length < 3) continue;
      let category = currentCategory;
      let itemName = "";
      let weightStr = "";
      let valueStr = "";

      if (tds.length >= 5) {
        category = tds[0] || currentCategory;
        currentCategory = category;
        itemName = tds[1];
        weightStr = tds[2];
        valueStr = tds[3];
      } else {
        itemName = tds[0];
        weightStr = tds[1];
        valueStr = tds[2];
      }

      const lowerCat = (category || "").toLowerCase();
      const lowerItem = (itemName || "").toLowerCase();
      if (lowerCat.includes("total") || lowerItem.includes("total") || lowerCat.includes("resit") || lowerItem.includes("resit")) {
        continue;
      }

      const wMatch = weightStr.match(/(\d+(?:[.,]\d+)?)\s*%/);
      if (!wMatch) continue;
      const weightPct = parseFloat(wMatch[1].replace(",", "."));
      if (isNaN(weightPct) || weightPct <= 0) continue;

      let val = null;
      if (valueStr !== "") {
        const parsedV = parseFloat(valueStr.replace(",", "."));
        if (!isNaN(parsedV) && parsedV >= 0 && parsedV <= 10) val = parsedV;
      }

      const isFinalExam =
        lowerCat.includes("final exam") ||
        lowerItem.includes("final exam") ||
        lowerItem === "fe" ||
        lowerCat.includes("final presentation");

      if (isFinalExam) {
        feWeightPct = (feWeightPct || 0) + weightPct;
        if (val !== null) feRecordedScore = val;
      } else {
        items.push({
          category: category || itemName,
          name: itemName || category,
          weight_pct: weightPct,
          value: val,
        });
      }
    }

    if (items.length === 0 && feWeightPct === null) return null;
    const finalFeW = feWeightPct !== null ? Math.min(feWeightPct / 100, 0.8) : 0.4;
    let gradedWeightSum = 0;
    let gradedWeightedPoints = 0;
    for (const it of items) {
      if (it.value !== null) {
        gradedWeightSum += it.weight_pct;
        gradedWeightedPoints += it.value * it.weight_pct;
      }
    }
    const cwAvg = gradedWeightSum > 0 ? Math.round((gradedWeightedPoints / gradedWeightSum) * 100) / 100 : null;

    return {
      subject_code: fallbackCode,
      subject_name: fallbackName || fallbackCode,
      fe_weight: Math.round(finalFeW * 100) / 100,
      fe_score_recorded: feRecordedScore,
      coursework_completed_weight_pct: Math.round(gradedWeightSum * 10) / 10,
      coursework_average: cwAvg,
      items,
    };
  }

  async function crawlCourseworkAspx() {
    const firstDoc = await fetchHtmlDoc(buildFapUrl("/Grade/StudentGrade.aspx"));
    const courseLinks = extractCourseLinks(firstDoc, "StudentGrade.aspx");
    const resultMap = {};
    if (courseLinks.length === 0) return resultMap;

    const docs = await Promise.all(
      courseLinks.map(async (cLink) => {
        try {
          return { cLink, doc: await fetchHtmlDoc(cLink.url) };
        } catch {
          return { cLink, doc: null };
        }
      })
    );
    for (const { cLink, doc } of docs) {
      if (!doc || !cLink.code) continue;
      const parsed = parseMarkReportTable(doc, cLink.code, cLink.name);
      if (parsed) resultMap[cLink.code] = parsed;
    }
    return resultMap;
  }

  function parseScheduleDoc(doc, studentId, fullName) {
    if (!doc) return null;
    const dayLabels = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];
    for (const table of Array.from(doc.querySelectorAll("table"))) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 3) continue;
      const scheduleRows = [];
      for (const tr of rows) {
        const tds = Array.from(tr.querySelectorAll("td"));
        if (tds.length < 7) continue;
        const firstCol = tds[0].textContent.trim();
        const slotMatch = firstCol.match(/slot\s*(\d+)/i);
        if (!slotMatch) continue;
        const slotNum = parseInt(slotMatch[1], 10);
        const timeMatch = firstCol.match(/(\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})/);
        const defaultTimes = { 1: "07:30-09:50", 2: "10:00-12:20", 3: "12:50-15:10", 4: "15:20-17:40" };
        const slotTime = timeMatch ? timeMatch[1] : defaultTimes[slotNum] || "";

        const daysObj = {};
        for (let dIdx = 0; dIdx < 7; dIdx++) {
          const cell = tds[dIdx + 1];
          const dayName = dayLabels[dIdx];
          if (!cell) {
            daysObj[dayName] = null;
            continue;
          }
          const txt = cell.textContent.replace(/\s+/g, " ").trim();
          const codeM = txt.match(CODE_REGEX);
          if (!txt || txt === "-" || !codeM) {
            daysObj[dayName] = null;
            continue;
          }
          const roomM = txt.match(/at\s+([A-Za-z0-9._-]+)/i);
          const classM = txt.match(/class\s+([A-Za-z0-9_-]+)/i);
          const gvM = txt.match(/(?:gv|lecturer)\s*:\s*([A-Za-z0-9_.-]+)/i);
          const lowerTxt = txt.toLowerCase();
          let status = "Chưa học";
          if (lowerTxt.includes("attended") || lowerTxt.includes("present") || lowerTxt.includes("có mặt")) status = "Có mặt";
          else if (lowerTxt.includes("absent") || lowerTxt.includes("vắng")) status = "Vắng mặt";

          daysObj[dayName] = {
            subject_code: codeM[1],
            room: roomM ? roomM[1] : "FPT",
            class_name: classM ? classM[1] : "FAP",
            lecturer: gvM ? gvM[1] : "FPTU",
            type: lowerTxt.includes("online") ? "Online" : "Offline",
            status,
          };
        }
        scheduleRows.push({ slot: slotNum, time: slotTime, days: daysObj });
      }
      if (scheduleRows.length > 0) {
        return {
          student_id: studentId || "FAP",
          full_name: fullName || "",
          week: `Đồng bộ trực tiếp từ FAP (${new Date().toLocaleDateString("vi-VN")})`,
          schedule: scheduleRows,
        };
      }
    }
    return null;
  }

  function parseAttendanceCourseDoc(doc, cLink, studentId) {
    const container = doc.querySelector("#ctl00_mainContent_divContent") || doc;
    for (const table of Array.from(container.querySelectorAll("table"))) {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) continue;
      const headers = Array.from(rows[0].querySelectorAll("th, td")).map((c) => c.textContent.trim().toLowerCase());
      const statusIdx = headers.findIndex((h) => h.includes("attendance") || h.includes("status") || h.includes("trạng thái"));
      const dateIdx = headers.findIndex((h) => h.includes("date") || h.includes("ngày"));
      if (statusIdx === -1 || dateIdx === -1) continue;

      const roomIdx = headers.findIndex((h) => h.includes("room") || h.includes("phòng"));
      const lecIdx = headers.findIndex((h) => h.includes("lecturer") || h.includes("giảng viên"));
      const grpIdx = headers.findIndex((h) => h.includes("group") || h.includes("lớp"));

      const slotRecords = [];
      let attended = 0;
      let absent = 0;
      let lecturer = "FPT Lecturer";
      let groupName = "FAP";

      for (let i = 1; i < rows.length; i++) {
        const tds = Array.from(rows[i].querySelectorAll("td")).map((c) => c.textContent.trim());
        if (tds.length <= statusIdx) continue;
        const rawSt = tds[statusIdx].toLowerCase();
        let viStatus = "Chưa học";
        if (rawSt.includes("present") || rawSt.includes("attended") || rawSt.includes("có mặt")) {
          viStatus = "Có mặt";
          attended += 1;
        } else if (rawSt.includes("absent") || rawSt.includes("vắng")) {
          viStatus = "Vắng mặt";
          absent += 1;
        }
        if (lecIdx >= 0 && tds[lecIdx]) lecturer = tds[lecIdx];
        if (grpIdx >= 0 && tds[grpIdx]) groupName = tds[grpIdx];
        slotRecords.push({
          session: i,
          date: dateIdx >= 0 ? tds[dateIdx] : "",
          room: roomIdx >= 0 ? tds[roomIdx] : "",
          status: viStatus,
        });
      }

      const totalSlots = slotRecords.length || 20;
      const currentSlot = attended + absent;
      const maxAllowed = Math.floor(totalSlots * 0.2);
      const remainAllowed = Math.max(maxAllowed - absent, 0);
      const isAf = absent > maxAllowed;
      const pctTotal = Math.round((100 * absent / Math.max(totalSlots, 1)) * 10) / 10;

      return {
        student_id: studentId || "FAP",
        subject_code: cLink.code || "FAP",
        subject_name: cLink.name || cLink.code || "Môn học FAP",
        class_name: groupName,
        lecturer,
        total_slots: totalSlots,
        current_slot: currentSlot,
        attended_slots: attended,
        absent_slots: absent,
        absent_rate_current: `${Math.round((100 * absent / Math.max(currentSlot, 1)) * 10) / 10}%`,
        absent_rate_total: `${pctTotal}%`,
        max_allowed_absent: maxAllowed,
        remaining_allowed_absent: remainAllowed,
        is_attendance_fail: isAf,
        warning_status: isAf
          ? `🚨 ĐÃ BỊ CẤM THI (AF) MÔN ${cLink.code}! Đã vắng ${absent}/${totalSlots} buổi (${pctTotal}% > 20%).`
          : remainAllowed <= 1
          ? `⚠️ SÁT NGƯỠNG CẤM THI: Đã vắng ${absent}/${totalSlots} buổi — chỉ còn phép nghỉ tối đa ${remainAllowed} buổi!`
          : `✅ An toàn: Đã vắng ${absent}/${totalSlots} buổi (${pctTotal}%), còn được nghỉ tối đa ${remainAllowed} buổi.`,
        records: slotRecords,
      };
    }
    return null;
  }

  async function crawlMultiAttendanceAspx(studentId) {
    const firstDoc = await fetchHtmlDoc(buildFapUrl("/Report/ViewAttendStudent.aspx"));
    const courseLinks = extractCourseLinks(firstDoc, "ViewAttendStudent.aspx");
    if (courseLinks.length === 0) {
      const single = parseAttendanceCourseDoc(firstDoc, { code: "FAP", name: "Môn học kỳ này" }, studentId);
      return single ? [single] : [];
    }
    const docs = await Promise.all(
      courseLinks.map(async (cLink) => {
        try {
          return { cLink, doc: await fetchHtmlDoc(cLink.url) };
        } catch {
          return { cLink, doc: null };
        }
      })
    );
    const out = [];
    for (const { cLink, doc } of docs) {
      if (!doc) continue;
      const parsed = parseAttendanceCourseDoc(doc, cLink, studentId);
      if (parsed) out.push(parsed);
    }
    return out;
  }

  function extractCurrentPageSummary() {
    const title =
      document.querySelector("h1, h2.page-title, h2, .breadcrumb")?.textContent?.trim() ||
      document.title ||
      "Trang FAP hiện tại";
    const path = window.location.pathname + window.location.search;
    const rawText = (document.querySelector("main, .container")?.innerText || document.body?.innerText || "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, 2800);
    return { title, path, snippet: rawText };
  }

  // =========================================================================
  // MAIN ENTRY: TỰ ĐỘNG CHỌN ĐÚNG ENGINE (FAP 2.0 SPA vs CLASSIC .ASPX)
  // =========================================================================
  async function runParallelFapCrawl(onProgress, options = {}) {
    const ctx = getPortalContext();

    // Nếu là giao diện FAP 2.0 SPA mới (https://fap.fpt.edu.vn không dùng .aspx) -> Chạy SPA Engine (0% lỗi 404!)
    if (!ctx.isClassicAspx) {
      return runFapV2SpaCrawl(onProgress, options);
    }

    // Nếu là /fap-simulator/*.aspx hoặc trang .aspx cổ điển -> Chạy 5 Worker song song .aspx
    const t0 = performance.now();
    const liveDomHint = extractIdentityFromDoc(document);

    const emit = (worker, status, detail) => {
      if (typeof onProgress === "function") {
        onProgress({ worker, status, detail, timestamp: Date.now() });
      }
    };

    emit("profile", "running", "Đang đọc...");
    emit("transcript", "running", "Đang kéo...");
    emit("coursework", "running", "Đang kéo...");
    emit("schedule", "running", "Đang kéo...");
    emit("attendance", "running", "Đang quét...");

    const wrapWorker = async (key, fn, formatDetail) => {
      try {
        const res = await fn();
        emit(key, "done", formatDetail(res));
        return res;
      } catch (err) {
        emit(key, "error", err.message || "Lỗi");
        throw err;
      }
    };

    const [profRes, transRes, cwRes, schedRes, attRes] = await Promise.allSettled([
      wrapWorker("profile", () => crawlProfileAspx(), (r) => r.student_id || "Xong"),
      wrapWorker(
        "transcript",
        async () => {
          const d = window.location.pathname.toLowerCase().includes("studenttranscript")
            ? document
            : await fetchHtmlDoc(buildFapUrl("/Grade/StudentTranscript.aspx"));
          return parseTranscriptDoc(d);
        },
        (r) => `${r.records.length} môn`
      ),
      wrapWorker("coursework", () => crawlCourseworkAspx(), (r) => `${Object.keys(r).length} lớp`),
      wrapWorker(
        "schedule",
        async () => {
          const d = window.location.pathname.toLowerCase().includes("scheduleofweek")
            ? document
            : await fetchHtmlDoc(buildFapUrl("/Report/ScheduleOfWeek.aspx"));
          return parseScheduleDoc(d, liveDomHint.student_id, liveDomHint.full_name);
        },
        (r) => (r ? `${r.schedule.length} ca` : "Trống")
      ),
      wrapWorker("attendance", () => crawlMultiAttendanceAspx(liveDomHint.student_id), (r) => `${r.length} lớp`),
    ]);

    const profile = profRes.status === "fulfilled" ? profRes.value : liveDomHint;
    const transcriptBundle =
      transRes.status === "fulfilled" ? transRes.value : { records: [], subjects_discovered: [] };
    const component_grades = cwRes.status === "fulfilled" ? cwRes.value : {};
    const schedule = schedRes.status === "fulfilled" ? schedRes.value : null;
    const attendances_multi = attRes.status === "fulfilled" ? attRes.value : [];

    const finalSid = (profile.student_id || liveDomHint.student_id || "").trim().toUpperCase();
    if (schedule && finalSid) schedule.student_id = finalSid;
    attendances_multi.forEach((a) => {
      if (finalSid) a.student_id = finalSid;
    });

    return {
      student_id: finalSid,
      full_name: profile.full_name || liveDomHint.full_name || "",
      email: profile.email || (finalSid ? `${finalSid.toLowerCase()}@fpt.edu.vn` : ""),
      major: profile.major || "",
      current_semester: profile.current_semester || null,
      campus: profile.campus || liveDomHint.campus || "Hà Nội",
      transcript: transcriptBundle.records,
      subjects_discovered: transcriptBundle.subjects_discovered,
      component_grades,
      schedule,
      attendances_multi,
      current_page: extractCurrentPageSummary(),
      portal_mode: ctx.isSimulator ? "simulator" : "fap_aspx",
      crawl_duration_ms: Math.round(performance.now() - t0),
      synced_at: new Date().toISOString(),
    };
  }

  function onLiveSpaSnapshotUpdate(cb) {
    if (typeof cb === "function") {
      packetListeners.add(cb);
      return () => packetListeners.delete(cb);
    }
    return () => {};
  }

  function scanCurrentDomNow() {
    ingestFap2LiveDom(document);
    return buildSnapshotFromSpaStore(0);
  }

  window.UniFsParallelCrawler = {
    runParallelFapCrawl,
    extractCurrentPageSummary,
    getPortalContext,
    onLiveSpaSnapshotUpdate,
    scanCurrentDomNow,
  };
})();
