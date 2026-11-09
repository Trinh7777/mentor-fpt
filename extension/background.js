/**
 * UniFs Pro — Manifest V3 Background Service Worker (background.js)
 * - Nhận dữ liệu Parallel Crawl từ fap.fpt.edu.vn / fap-simulator
 * - Lưu snapshot mới nhất vào chrome.storage.local
 * - Đồng bộ ngầm sang FastAPI Backend (http://localhost:8000/api/v1/update-student-data)
 *   không bị chặn Mixed-Content hay CORS từ trang HTTPS FAP!
 * - Điều phối mở Copilot Drawer hoặc Side Panel khi người dùng bấm icon trên thanh công cụ.
 */

const DEFAULT_SERVER_URL = "http://localhost:8000";

async function getServerUrl() {
  try {
    const res = await chrome.storage.local.get(["unifs_server_url"]);
    return (res.unifs_server_url || DEFAULT_SERVER_URL).replace(/\/+$/, "");
  } catch {
    return DEFAULT_SERVER_URL;
  }
}

async function syncSnapshotToBackend(snapshot) {
  const serverUrl = await getServerUrl();
  try {
    const response = await fetch(`${serverUrl}/api/v1/update-student-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    const syncMeta = {
      ok: true,
      server_online: true,
      server_url: serverUrl,
      message: data.message || "Đồng bộ thành công",
      db_result: data.db_result || {},
      synced_at: new Date().toISOString(),
    };
    await chrome.storage.local.set({
      unifs_last_snapshot: snapshot,
      unifs_sync_status: syncMeta,
    });
    return syncMeta;
  } catch (err) {
    const offlineMeta = {
      ok: false,
      server_online: false,
      server_url: serverUrl,
      message: `Đã lưu cục bộ dữ liệu FAP (Backend ${serverUrl} chưa bật: ${err.message})`,
      synced_at: new Date().toISOString(),
    };
    await chrome.storage.local.set({
      unifs_last_snapshot: snapshot,
      unifs_sync_status: offlineMeta,
    });
    return offlineMeta;
  }
}

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === "UNIFS_SYNC_SNAPSHOT") {
    syncSnapshotToBackend(msg.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }

  if (msg.type === "UNIFS_GET_LATEST_STATE") {
    chrome.storage.local
      .get(["unifs_last_snapshot", "unifs_sync_status", "unifs_server_url"])
      .then((data) => {
        sendResponse({
          snapshot: data.unifs_last_snapshot || null,
          sync_status: data.unifs_sync_status || null,
          server_url: data.unifs_server_url || DEFAULT_SERVER_URL,
        });
      })
      .catch(() => sendResponse({ snapshot: null, sync_status: null, server_url: DEFAULT_SERVER_URL }));
    return true;
  }

  if (msg.type === "UNIFS_REQUEST_ACTIVE_TAB_CRAWL") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs && tabs[0];
      if (!activeTab || !activeTab.id) {
        sendResponse({ ok: false, error: "Không tìm thấy tab FAP đang mở." });
        return;
      }
      chrome.tabs.sendMessage(activeTab.id, { type: "UNIFS_TRIGGER_CRAWL" }, (resp) => {
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            error: "Hãy mở tab https://fap.fpt.edu.vn (hoặc /fap-simulator) để kéo dữ liệu trực tiếp!",
          });
        } else {
          sendResponse(resp || { ok: true });
        }
      });
    });
    return true;
  }

  if (msg.type === "UNIFS_OPEN_SIDE_PANEL") {
    if (chrome.sidePanel && sender.tab && sender.tab.windowId) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    }
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
