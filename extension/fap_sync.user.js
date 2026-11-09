// ==UserScript==
// @name         UniFs Pro — FAP Parallel Sync & In-Page AI Studio
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @description  Kéo song song Bảng điểm, Điểm thành phần, Lịch học & Điểm danh đa môn từ FAP về UniFs Pro Server (cổng 8000).
// @author       FPTU AI Team
// @match        https://fap.fpt.edu.vn/*
// @match        http://localhost:8000/fap-simulator/*
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";
  const BACKEND_URL = "http://localhost:8000";

  // Nếu người dùng đã cài Chrome Extension chính thức thì nhường quyền cho Extension để không hiển thị 2 nút trùng nhau
  if (document.getElementById("unifs-copilot-launcher")) return;

  const btn = document.createElement("button");
  btn.textContent = "⚡ UniFs Parallel Sync & AI";
  btn.style.cssText =
    "position:fixed;right:22px;bottom:22px;z-index:999999;padding:10px 18px;border-radius:999px;border:1.5px solid #f37021;background:#0f172a;color:#fff;font-weight:700;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,0.4);";

  btn.onclick = () => {
    window.open(BACKEND_URL, "_blank");
  };

  document.body.appendChild(btn);
})();
