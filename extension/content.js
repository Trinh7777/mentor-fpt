/**
 * UniFs Pro — FAP In-Page Content Controller (content.js)
 * - Tự động kích hoạt Parallel FAP Crawler (5 luồng song song) ngay khi mở fap.fpt.edu.vn
 * - Hiển thị nút nổi 3D Robot + Ngăn kéo Copilot AI (Slide-Over Drawer) ngay trên FAP
 * - Cầu nối 2 chiều thời gian thực giữa trang FAP <-> Copilot Iframe <-> Background Worker
 */

(function () {
  if (window.__UNIFS_CONTENT_INITIALIZED__) return;
  window.__UNIFS_CONTENT_INITIALIZED__ = true;

  let isDrawerOpen = false;
  let isExpanded = false;
  let isCrawling = false;
  let latestSnapshot = null;
  let latestSyncMeta = null;
  let workerStates = {
    profile: { status: "idle", detail: "" },
    transcript: { status: "idle", detail: "" },
    coursework: { status: "idle", detail: "" },
    schedule: { status: "idle", detail: "" },
    attendance: { status: "idle", detail: "" },
  };

  let launcherEl = null;
  let subTextEl = null;
  let dotEl = null;
  let afPillEl = null;
  let drawerEl = null;
  let backdropEl = null;
  let iframeEl = null;

  function postToCopilot(type, payload) {
    if (iframeEl && iframeEl.contentWindow) {
      iframeEl.contentWindow.postMessage({ source: "UNIFS_CONTENT", type, payload }, "*");
    }
  }

  function createInjectedUi() {
    if (document.getElementById("unifs-copilot-launcher")) return;

    const mascotUrl = chrome.runtime.getURL("icons/mascot.png");
    const copilotUrl = chrome.runtime.getURL("copilot.html?mode=drawer");

    // 1. Backdrop (only visible when expanded wide)
    backdropEl = document.createElement("div");
    backdropEl.id = "unifs-copilot-backdrop";
    backdropEl.addEventListener("click", () => {
      if (isExpanded) {
        setExpanded(false);
      } else {
        setDrawerOpen(false);
      }
    });

    // 2. Floating Launcher Pill
    launcherEl = document.createElement("div");
    launcherEl.id = "unifs-copilot-launcher";
    launcherEl.title = "Mở Trợ lý Học vụ AI UniFs ngay trên FAP (Phím tắt: Alt + U)";
    launcherEl.innerHTML = `
      <div class="unifs-launcher-avatar">
        <img src="${mascotUrl}" alt="UniFs AI" />
        <span class="unifs-launcher-dot syncing" id="unifs-launcher-dot"></span>
      </div>
      <div class="unifs-launcher-meta">
        <div class="unifs-launcher-title">
          <span>UniFs AI Copilot</span>
          <span class="unifs-launcher-kbd">Alt+U</span>
          <span class="unifs-af-pill" id="unifs-af-pill" style="display:none">AF!</span>
        </div>
        <div class="unifs-launcher-sub" id="unifs-launcher-sub">⚡ Đang kéo song song 5 luồng FAP...</div>
      </div>
    `;
    launcherEl.addEventListener("click", () => setDrawerOpen(true));

    // 3. Slide-Over Copilot Drawer
    drawerEl = document.createElement("div");
    drawerEl.id = "unifs-copilot-drawer";

    iframeEl = document.createElement("iframe");
    iframeEl.id = "unifs-copilot-iframe";
    iframeEl.src = copilotUrl;
    iframeEl.allow = "clipboard-write";
    iframeEl.addEventListener("load", () => {
      pushFullStateToCopilot();
    });

    drawerEl.appendChild(iframeEl);
    document.body.appendChild(backdropEl);
    document.body.appendChild(launcherEl);
    document.body.appendChild(drawerEl);

    subTextEl = document.getElementById("unifs-launcher-sub");
    dotEl = document.getElementById("unifs-launcher-dot");
    afPillEl = document.getElementById("unifs-af-pill");
  }

  function setDrawerOpen(open) {
    isDrawerOpen = Boolean(open);
    if (!drawerEl || !launcherEl) return;
    if (isDrawerOpen) {
      drawerEl.classList.add("open");
      launcherEl.classList.add("unifs-hidden");
      if (isExpanded && backdropEl) backdropEl.classList.add("visible");
      pushFullStateToCopilot();
    } else {
      drawerEl.classList.remove("open");
      launcherEl.classList.remove("unifs-hidden");
      if (backdropEl) backdropEl.classList.remove("visible");
    }
  }

  function setExpanded(exp) {
    isExpanded = Boolean(exp);
    if (!drawerEl || !backdropEl) return;
    if (isExpanded) {
      drawerEl.classList.add("expanded");
      if (isDrawerOpen) backdropEl.classList.add("visible");
    } else {
      drawerEl.classList.remove("expanded");
      backdropEl.classList.remove("visible");
    }
    postToCopilot("UNIFS_DRAWER_SIZE", { expanded: isExpanded });
  }

  function pushFullStateToCopilot() {
    postToCopilot("UNIFS_STATE_INIT", {
      isCrawling,
      workerStates,
      snapshot: latestSnapshot,
      syncMeta: latestSyncMeta,
      expanded: isExpanded,
      currentPage: window.UniFsParallelCrawler
        ? window.UniFsParallelCrawler.extractCurrentPageSummary()
        : null,
    });
  }

  function updateLauncherStatus() {
    if (!subTextEl || !dotEl || !afPillEl) return;

    if (isCrawling) {
      dotEl.className = "unifs-launcher-dot syncing";
      const doneCount = Object.values(workerStates).filter((w) => w.status === "done").length;
      subTextEl.textContent = `⚡ Đang kéo song song FAP (${doneCount}/5 luồng)...`;
      return;
    }

    if (!latestSnapshot || !latestSnapshot.student_id) {
      dotEl.className = "unifs-launcher-dot";
      subTextEl.textContent = "Bấm để mở Trợ lý Học vụ AI";
      return;
    }

    const afCourses = (latestSnapshot.attendances_multi || []).filter((c) => c.is_attendance_fail);
    if (afCourses.length > 0) {
      dotEl.className = "unifs-launcher-dot danger";
      afPillEl.style.display = "inline-block";
      afPillEl.textContent = `${afCourses.length} AF`;
      subTextEl.textContent = `${latestSnapshot.student_id} · Cảnh báo cấm thi ${afCourses[0].subject_code}!`;
    } else {
      dotEl.className = "unifs-launcher-dot";
      afPillEl.style.display = "none";
      const tCount = (latestSnapshot.transcript || []).length;
      const cwCount = Object.keys(latestSnapshot.component_grades || {}).length;
      subTextEl.textContent = `${latestSnapshot.student_id} · Đã kéo ${tCount} môn & ${cwCount} bảng điểm TP`;
    }
  }

  async function triggerParallelSync() {
    if (isCrawling || !window.UniFsParallelCrawler) return null;
    isCrawling = true;
    updateLauncherStatus();
    postToCopilot("UNIFS_CRAWL_STARTED", { startedAt: Date.now() });

    try {
      const snapshot = await window.UniFsParallelCrawler.runParallelFapCrawl((prog) => {
        workerStates[prog.worker] = { status: prog.status, detail: prog.detail };
        updateLauncherStatus();
        postToCopilot("UNIFS_CRAWL_PROGRESS", { workerStates, event: prog });
      });

      latestSnapshot = snapshot;
      isCrawling = false;
      updateLauncherStatus();

      // Gửi sang Service Worker để đồng bộ vào SQLite Backend (không lo Mixed-Content HTTPS -> HTTP)
      chrome.runtime.sendMessage(
        { type: "UNIFS_SYNC_SNAPSHOT", payload: snapshot },
        (syncResp) => {
          latestSyncMeta = syncResp || null;
          postToCopilot("UNIFS_CRAWL_COMPLETE", {
            snapshot: latestSnapshot,
            syncMeta: latestSyncMeta,
            workerStates,
          });
        }
      );

      return snapshot;
    } catch (err) {
      isCrawling = false;
      updateLauncherStatus();
      postToCopilot("UNIFS_CRAWL_ERROR", { error: err.message || "Không thể quét FAP" });
      return null;
    }
  }

  // Lắng nghe lệnh từ Copilot Iframe
  window.addEventListener("message", (event) => {
    const data = event.data;
    if (!data || data.source !== "UNIFS_COPILOT") return;

    if (data.type === "UNIFS_CMD_CLOSE") {
      setDrawerOpen(false);
    } else if (data.type === "UNIFS_CMD_TOGGLE_EXPAND") {
      setExpanded(!isExpanded);
    } else if (data.type === "UNIFS_CMD_CRAWL") {
      triggerParallelSync();
    } else if (data.type === "UNIFS_CMD_GET_STATE") {
      pushFullStateToCopilot();
    } else if (data.type === "UNIFS_CMD_OPEN_SIDEPANEL") {
      chrome.runtime.sendMessage({ type: "UNIFS_OPEN_SIDE_PANEL" });
    }
  });

  // Lắng nghe lệnh từ Popup / Background Service Worker
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    if (msg.type === "UNIFS_TRIGGER_CRAWL") {
      triggerParallelSync().then((snap) => sendResponse({ ok: true, snapshot: snap }));
      return true;
    }
    if (msg.type === "UNIFS_OPEN_DRAWER") {
      setDrawerOpen(true);
      sendResponse({ ok: true });
      return false;
    }
    return false;
  });

  // Phím tắt Alt + U để bật/tắt nhanh Copilot ngay khi đang xem bảng điểm trên FAP
  window.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      setDrawerOpen(!isDrawerOpen);
    } else if (e.key === "Escape" && isDrawerOpen && isExpanded) {
      setExpanded(false);
    }
  });

  let syncDebounceTimer = null;
  let lastSyncedSignature = "";

  function computeSnapshotSignature(snap) {
    if (!snap) return "";
    return [
      snap.student_id || "",
      snap.full_name || "",
      (snap.transcript || []).length,
      (snap.subjects_discovered || []).length,
      Object.keys(snap.component_grades || {}).length,
      (snap.attendances_multi || []).length,
      snap.schedule ? (snap.schedule.schedule || []).length : 0,
    ].join("|");
  }

  function refreshWorkerPillsFromSnapshot(snap) {
    if (!snap) return;
    workerStates = {
      profile: {
        status: snap.student_id ? "done" : "idle",
        detail: snap.student_id || "Chờ nhận diện",
      },
      transcript: {
        status: (snap.transcript || []).length > 0 ? "done" : "idle",
        detail: (snap.transcript || []).length > 0 ? `${snap.transcript.length} môn` : "Mở Báo cáo HT",
      },
      coursework: {
        status: Object.keys(snap.component_grades || {}).length > 0 ? "done" : "idle",
        detail:
          Object.keys(snap.component_grades || {}).length > 0
            ? `${Object.keys(snap.component_grades).length} lớp`
            : "Mở Điểm TP",
      },
      schedule: {
        status: snap.schedule ? "done" : "idle",
        detail: snap.schedule ? `${(snap.schedule.schedule || []).length} ca` : "Mở Lịch học",
      },
      attendance: {
        status: (snap.attendances_multi || []).length > 0 ? "done" : "idle",
        detail:
          (snap.attendances_multi || []).length > 0
            ? `${snap.attendances_multi.length} lớp`
            : "Mở Điểm danh",
      },
    };
  }

  function scheduleIncrementalSync(updatedSnap) {
    if (!updatedSnap || !updatedSnap.student_id) return;
    const sig = computeSnapshotSignature(updatedSnap);
    if (sig === lastSyncedSignature) return;

    latestSnapshot = updatedSnap;
    refreshWorkerPillsFromSnapshot(updatedSnap);
    updateLauncherStatus();

    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(() => {
      lastSyncedSignature = sig;
      chrome.runtime.sendMessage(
        { type: "UNIFS_SYNC_SNAPSHOT", payload: latestSnapshot },
        (syncResp) => {
          latestSyncMeta = syncResp || null;
          postToCopilot("UNIFS_CRAWL_COMPLETE", {
            snapshot: latestSnapshot,
            syncMeta: latestSyncMeta,
            workerStates,
          });
        }
      );
    }, 380);
  }

  function bootstrap() {
    createInjectedUi();

    // Lắng nghe gói JSON API & biến động bảng DOM theo thời gian thực trên FAP 2.0 SPA!
    if (window.UniFsParallelCrawler?.onLiveSpaSnapshotUpdate) {
      window.UniFsParallelCrawler.onLiveSpaSnapshotUpdate((snap) => {
        scheduleIncrementalSync(snap);
      });
    }

    if (window.UniFsParallelCrawler && !window.UniFsParallelCrawler.getPortalContext().isClassicAspx) {
      let domTimer = null;
      const obs = new MutationObserver(() => {
        clearTimeout(domTimer);
        domTimer = setTimeout(() => {
          const domSnap = window.UniFsParallelCrawler.scanCurrentDomNow();
          scheduleIncrementalSync(domSnap);
        }, 550);
      });
      obs.observe(document.body, { childList: true, subtree: true });
    }

    // Tự động kích hoạt quét ngay khi sinh viên mở trang FAP
    setTimeout(() => {
      triggerParallelSync();
    }, 350);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap);
  } else {
    bootstrap();
  }
})();
