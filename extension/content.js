/**
 * UniFs FAP Extractor & Synchronizer - Content Script
 * Chạy trực tiếp trên ngữ cảnh trang web fap.fpt.edu.vn của người dùng
 */

const BACKEND_API_URL = "http://localhost:8000/api/v1/update-student-data";

// ── 1. HÀM BÓC TÁCH DỮ LIỆU DOM ──

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

/**
 * Trích xuất MSSV & Tên từ DOM trang FAP
 */
function extractStudentInfo() {
  const info = {
    student_id: "",
    full_name: "",
  };

  // 1. Thử tìm theo ID hoặc selector quen thuộc của ASP.NET
  const nameEl = document.querySelector("#ctl00_lblFullName, #ctl00_lblStudent, #StudentName, span[id*='Student'], span[id*='lblUser']");
  if (nameEl) {
    info.full_name = cleanText(nameEl.innerText);
  }

  // 2. Tìm MSSV dạng mã chuẩn FPT (VD: SE190456, HE181234, IA170123,...)
  const bodyText = document.body.innerText || "";
  const match = bodyText.match(/\b([A-Z]{2}\d{6})\b/);
  if (match) {
    info.student_id = match[1];
  }

  return info;
}

/**
 * Trích xuất toàn bộ bảng điểm (Transcript / Mark Report)
 */
function extractTranscriptData(studentId) {
  const records = [];
  const tables = document.querySelectorAll("table");

  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) return;

    // Tìm dòng header
    let headerRow = rows[0];
    let headers = Array.from(headerRow.querySelectorAll("th, td")).map((c) => cleanText(c.innerText).toLowerCase());

    // Nếu dòng đầu không chứa header rõ ràng, thử dòng 2
    if (!headers.some((h) => h.includes("code") || h.includes("subject") || h.includes("mã môn") || h.includes("grade") || h.includes("điểm"))) {
      if (rows[1]) {
        headers = Array.from(rows[1].querySelectorAll("th, td")).map((c) => cleanText(c.innerText).toLowerCase());
      }
    }

    const codeIdx = headers.findIndex((h) => h.includes("subject code") || h.includes("code") || h.includes("mã môn"));
    const gradeIdx = headers.findIndex((h) => h.includes("average") || h.includes("grade") || h.includes("điểm"));
    const statusIdx = headers.findIndex((h) => h.includes("status") || h.includes("trạng thái"));
    const termIdx = headers.findIndex((h) => h.includes("term") || h.includes("semester") || h.includes("học kỳ") || h.includes("kỳ"));

    // Nếu bảng có cột mã môn
    if (codeIdx !== -1) {
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        if (!cells.length || cells.length <= codeIdx) return;

        const rawCode = cleanText(cells[codeIdx].innerText);
        // Kiểm tra xem mã môn có hợp lệ không (thường 5-8 ký tự viết hoa)
        if (!rawCode || rawCode.toLowerCase().includes("code") || rawCode.length < 3) return;

        let grade = null;
        if (gradeIdx !== -1 && cells[gradeIdx]) {
          const parsed = parseFloat(cleanText(cells[gradeIdx].innerText));
          if (!isNaN(parsed)) grade = parsed;
        }

        let status = "Passed";
        if (statusIdx !== -1 && cells[statusIdx]) {
          const sText = cleanText(cells[statusIdx].innerText).toLowerCase();
          if (sText.includes("fail") || sText.includes("không đạt") || sText.includes("học lại")) {
            status = "Failed";
          } else if (sText.includes("study") || sText.includes("đang học") || grade === null) {
            status = "Studying";
          } else {
            status = "Passed";
          }
        } else if (grade === null) {
          status = "Studying";
        } else if (grade < 5.0) {
          status = "Failed";
        }

        let semesterTaken = 1;
        if (termIdx !== -1 && cells[termIdx]) {
          const tText = cleanText(cells[termIdx].innerText);
          const tNum = parseInt(tText.replace(/\D/g, ""), 10);
          if (!isNaN(tNum) && tNum > 0) semesterTaken = tNum;
        }

        records.push({
          student_id: studentId || "CURRENT_STUDENT",
          subject_code: rawCode,
          semester_taken: semesterTaken,
          grade: grade,
          status: status,
        });
      });
    }
  });

  return records;
}

/**
 * Trích xuất Thời khóa biểu / Lịch học (Schedule)
 */
function extractScheduleData() {
  const schedule = [];
  const tables = document.querySelectorAll("table");

  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 3) return;

      const rowText = cells.map((c) => cleanText(c.innerText));
      // Nếu dòng chứa thông tin môn học, slot, phòng
      const joined = rowText.join(" ");
      if (joined.match(/(slot|\d{1,2}:\d{2}|room|phòng|[A-Z]{3}\d{3})/i)) {
        schedule.push({
          details: rowText,
        });
      }
    });
  });

  return schedule;
}

/**
 * Trích xuất Điểm danh (Attendance)
 */
function extractAttendanceData() {
  const attendance = [];
  const tables = document.querySelectorAll("table");

  tables.forEach((table) => {
    const rows = Array.from(table.querySelectorAll("tr"));
    rows.forEach((row) => {
      const cells = Array.from(row.querySelectorAll("td"));
      if (cells.length < 3) return;

      const texts = cells.map((c) => cleanText(c.innerText));
      const rowStr = texts.join(" ").toLowerCase();

      if (rowStr.includes("present") || rowStr.includes("absent") || rowStr.includes("vắng") || rowStr.includes("có mặt")) {
        attendance.push({
          data: texts,
        });
      }
    });
  });

  return attendance;
}

// ── 2. ĐỒNG BỘ VỀ BACKEND API ──

async function sendToBackend(payload) {
  const response = await fetch(BACKEND_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`API returned ${response.status}: ${errText}`);
  }

  return await response.json();
}

// ── 3. ĐỒNG BỘ TỰ ĐỘNG NGẦM (SILENT AUTO-SYNC) & NÚT BẤM ──

async function performSync(isSilent = false) {
  const btn = document.getElementById("unifs-sync-btn");
  const statusMsg = document.getElementById("unifs-sync-status");

  if (!isSilent && btn) {
    btn.classList.add("loading");
    btn.disabled = true;
    showStatus("Đang đọc dữ liệu từ FAP...", "info");
  }

  try {
    const studentInfo = extractStudentInfo();
    const transcript = extractTranscriptData(studentInfo.student_id);
    const schedule = extractScheduleData();
    const attendance = extractAttendanceData();

    // Nếu chạy ngầm mà trang hiện tại không có MSSV hoặc không có bảng dữ liệu nào thì bỏ qua
    if (isSilent && !studentInfo.student_id && !transcript.length && !schedule.length && !attendance.length) {
      return;
    }

    const payload = {
      student_id: studentInfo.student_id || "CURRENT_STUDENT",
      full_name: studentInfo.full_name || "",
      current_url: window.location.href,
      synced_at: new Date().toISOString(),
      transcript: transcript,
      schedule: schedule,
      attendance: attendance,
    };

    const res = await sendToBackend(payload);
    console.log("[UniFs Auto-Sync] Đã đồng bộ ngầm về Database:", res);

    if (btn) {
      const span = btn.querySelector("span");
      if (span) span.innerText = "Đã tự động đồng bộ FAP ✓";
    }
    if (!isSilent) {
      showStatus(`✅ ${res.message || "Dữ liệu đã được nạp vào Database!"}`, "success");
    }
  } catch (err) {
    if (!isSilent) {
      console.error("[UniFs Sync] Lỗi:", err);
      showStatus(`❌ Lỗi đồng bộ: ${err.message}. Hãy chắc chắn ứng dụng Streamlit đang chạy!`, "error");
    }
  } finally {
    if (btn) {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
    if (!isSilent && statusMsg) {
      setTimeout(() => {
        if (statusMsg.classList.contains("success")) {
          statusMsg.style.display = "none";
        }
      }, 4500);
    }
  }
}

function injectSyncButton() {
  if (document.getElementById("unifs-sync-container")) return;

  const container = document.createElement("div");
  container.id = "unifs-sync-container";

  const statusMsg = document.createElement("div");
  statusMsg.id = "unifs-sync-status";

  const btn = document.createElement("button");
  btn.id = "unifs-sync-btn";
  btn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
    </svg>
    <span>Đồng bộ UniFs Chatbot</span>
  `;

  btn.addEventListener("click", () => performSync(false));

  container.appendChild(statusMsg);
  container.appendChild(btn);
  document.body.appendChild(container);

  // Tự động đồng bộ ngầm (Silent Auto-Sync) sau 800ms khi trang FAP tải xong
  setTimeout(() => performSync(true), 800);
}

function showStatus(text, type) {
  const statusMsg = document.getElementById("unifs-sync-status");
  if (!statusMsg) return;
  statusMsg.className = type;
  statusMsg.innerText = text;
}

// Khởi chạy
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectSyncButton);
} else {
  injectSyncButton();
}

