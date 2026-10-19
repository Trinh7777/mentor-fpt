// ==UserScript==
// @name         UniFs FAP Sync - FPT Chatbot Connector
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @description  Bóc tách bảng điểm, lịch học từ FAP và gửi trực tiếp về UniFs Chatbot
// @author       UniFs Team
// @match        https://fap.fpt.edu.vn/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  'use strict';

  const BACKEND_API_URL = "http://localhost:8000/api/v1/update-student-data";

  function cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function extractStudentInfo() {
    const info = { student_id: "", full_name: "" };
    const nameEl = document.querySelector("#ctl00_lblFullName, #ctl00_lblStudent, #StudentName, span[id*='Student'], span[id*='lblUser']");
    if (nameEl) info.full_name = cleanText(nameEl.innerText);

    const bodyText = document.body.innerText || "";
    const match = bodyText.match(/\b([A-Z]{2}\d{6})\b/);
    if (match) info.student_id = match[1];
    return info;
  }

  function extractTranscriptData(studentId) {
    const records = [];
    const tables = document.querySelectorAll("table");

    tables.forEach((table) => {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length < 2) return;

      let headerRow = rows[0];
      let headers = Array.from(headerRow.querySelectorAll("th, td")).map((c) => cleanText(c.innerText).toLowerCase());

      if (!headers.some((h) => h.includes("code") || h.includes("subject") || h.includes("grade") || h.includes("điểm"))) {
        if (rows[1]) headers = Array.from(rows[1].querySelectorAll("th, td")).map((c) => cleanText(c.innerText).toLowerCase());
      }

      const codeIdx = headers.findIndex((h) => h.includes("subject code") || h.includes("code") || h.includes("mã môn"));
      const gradeIdx = headers.findIndex((h) => h.includes("average") || h.includes("grade") || h.includes("điểm"));
      const statusIdx = headers.findIndex((h) => h.includes("status") || h.includes("trạng thái"));
      const termIdx = headers.findIndex((h) => h.includes("term") || h.includes("semester") || h.includes("kỳ"));

      if (codeIdx !== -1) {
        rows.forEach((row) => {
          const cells = Array.from(row.querySelectorAll("td"));
          if (!cells.length || cells.length <= codeIdx) return;

          const rawCode = cleanText(cells[codeIdx].innerText);
          if (!rawCode || rawCode.toLowerCase().includes("code") || rawCode.length < 3) return;

          let grade = null;
          if (gradeIdx !== -1 && cells[gradeIdx]) {
            const parsed = parseFloat(cleanText(cells[gradeIdx].innerText));
            if (!isNaN(parsed)) grade = parsed;
          }

          let status = "Passed";
          if (statusIdx !== -1 && cells[statusIdx]) {
            const sText = cleanText(cells[statusIdx].innerText).toLowerCase();
            if (sText.includes("fail") || sText.includes("không đạt")) status = "Failed";
            else if (sText.includes("study") || sText.includes("đang học") || grade === null) status = "Studying";
            else status = "Passed";
          } else if (grade === null) status = "Studying";
          else if (grade < 5.0) status = "Failed";

          let semesterTaken = 1;
          if (termIdx !== -1 && cells[termIdx]) {
            const tNum = parseInt(cleanText(cells[termIdx].innerText).replace(/\D/g, ""), 10);
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

  function injectUI() {
    const btn = document.createElement("button");
    btn.innerText = "🎓 Đồng bộ UniFs Chatbot";
    btn.style.position = "fixed";
    btn.style.bottom = "24px";
    btn.style.right = "24px";
    btn.style.zIndex = "999999";
    btn.style.backgroundColor = "#f26f21";
    btn.style.color = "#ffffff";
    btn.style.border = "none";
    btn.style.padding = "12px 18px";
    btn.style.borderRadius = "24px";
    btn.style.fontWeight = "bold";
    btn.style.cursor = "pointer";
    btn.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";

    btn.onclick = function () {
      btn.innerText = "⏳ Đang đồng bộ...";
      btn.disabled = true;

      const studentInfo = extractStudentInfo();
      const transcript = extractTranscriptData(studentInfo.student_id);

      const payload = {
        student_id: studentInfo.student_id || "CURRENT_STUDENT",
        full_name: studentInfo.full_name || "",
        current_url: window.location.href,
        synced_at: new Date().toISOString(),
        transcript: transcript,
      };

      GM_xmlhttpRequest({
        method: "POST",
        url: BACKEND_API_URL,
        headers: { "Content-Type": "application/json" },
        data: JSON.stringify(payload),
        onload: function (response) {
          btn.innerText = "✅ Đã đồng bộ!";
          alert("Dữ liệu đã được gửi thành công về UniFs Chatbot!");
          setTimeout(() => {
            btn.innerText = "🎓 Đồng bộ UniFs Chatbot";
            btn.disabled = false;
          }, 3000);
        },
        onerror: function (err) {
          btn.innerText = "❌ Lỗi!";
          alert("Không thể kết nối đến Chatbot Local (http://localhost:8000). Bạn đã khởi động backend chưa?");
          setTimeout(() => {
            btn.innerText = "🎓 Đồng bộ UniFs Chatbot";
            btn.disabled = false;
          }, 3000);
        }
      });
    };

    document.body.appendChild(btn);
  }

  window.addEventListener("load", injectUI);
})();
