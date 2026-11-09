/**
 * UniFs Pro — FAP 2.0 SPA Main-World Network & Storage Sniffer (fap_page_hook.js)
 * Chạy ở world: "MAIN" ngay tại document_start trên https://fap.fpt.edu.vn/*
 * - Bắt tự động 100% gói tin JSON từ window.fetch & XMLHttpRequest của giao diện FAP 2.0 SPA mới
 *   (hoàn toàn Read-Only, không can thiệp hay làm chậm request gốc của FAP).
 * - Đọc thông tin sinh viên từ localStorage / sessionStorage / JWT claims.
 */

(function () {
  if (window.__UNIFS_MAIN_HOOK_INSTALLED__) return;
  window.__UNIFS_MAIN_HOOK_INSTALLED__ = true;

  const MAX_BUFFER = 80;
  window.__UNIFS_CAPTURED_APIS__ = window.__UNIFS_CAPTURED_APIS__ || [];

  function shouldInspectUrl(url) {
    if (!url || typeof url !== "string") return false;
    const lower = url.toLowerCase();
    if (
      lower.includes("localhost:") ||
      lower.includes("127.0.0.1:") ||
      lower.includes("cloudflare") ||
      lower.includes("google-analytics") ||
      lower.includes("clarity.ms") ||
      lower.endsWith(".js") ||
      lower.endsWith(".css") ||
      lower.endsWith(".png") ||
      lower.endsWith(".svg") ||
      lower.endsWith(".woff2")
    ) {
      return false;
    }
    return true;
  }

  function broadcastApiCapture(url, method, data) {
    if (!data || typeof data !== "object") return;
    const entry = {
      url: String(url || ""),
      method: String(method || "GET").toUpperCase(),
      data,
      ts: Date.now(),
    };
    window.__UNIFS_CAPTURED_APIS__.push(entry);
    if (window.__UNIFS_CAPTURED_APIS__.length > MAX_BUFFER) {
      window.__UNIFS_CAPTURED_APIS__.shift();
    }

    const msg = {
      source: "UNIFS_MAIN_HOOK",
      type: "FAP_API_JSON",
      payload: entry,
    };
    try {
      window.postMessage(msg, "*");
      if (window.top && window.top !== window) {
        window.top.postMessage(msg, "*");
      }
    } catch {
      // ignore cross-frame post error
    }
  }

  // 1. Read-Only Hook trên window.fetch
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const reqInfo = args[0];
        const reqInit = args[1] || {};
        const url = typeof reqInfo === "string" ? reqInfo : reqInfo?.url || "";
        const method = reqInit.method || reqInfo?.method || "GET";

        if (shouldInspectUrl(url) && response && response.ok) {
          const ct = (response.headers?.get("content-type") || "").toLowerCase();
          if (ct.includes("application/json") || ct.includes("+json") || url.includes("/api/")) {
            const cloned = response.clone();
            cloned
              .json()
              .then((jsonData) => broadcastApiCapture(url, method, jsonData))
              .catch(() => {});
          }
        }
      } catch {
        // never break host page fetch
      }
      return response;
    };
  }

  // 2. Read-Only Hook trên XMLHttpRequest (cho Axios / XHR trên FAP 2.0 SPA)
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this.__unifsMethod = method || "GET";
      this.__unifsUrl = typeof url === "string" ? url : String(url || "");
    } catch {
      // ignore
    }
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    try {
      this.addEventListener("load", function () {
        try {
          const url = this.__unifsUrl || this.responseURL || "";
          if (!shouldInspectUrl(url) || this.status < 200 || this.status >= 300) return;

          if (this.responseType === "json" && this.response) {
            broadcastApiCapture(url, this.__unifsMethod, this.response);
            return;
          }
          if (!this.responseType || this.responseType === "text") {
            const txt = (this.responseText || "").trim();
            if ((txt.startsWith("{") && txt.endsWith("}")) || (txt.startsWith("[") && txt.endsWith("]"))) {
              const parsed = JSON.parse(txt);
              broadcastApiCapture(url, this.__unifsMethod, parsed);
            }
          }
        } catch {
          // ignore non-json XHR
        }
      });
    } catch {
      // ignore
    }
    return origSend.apply(this, args);
  };

  // 3. Giải mã an toàn JWT payload hoặc JSON trong localStorage / sessionStorage để lấy Hồ sơ SV
  function decodeJwtPayload(str) {
    if (typeof str !== "string") return null;
    const clean = str.replace(/^Bearer\s+/i, "").trim();
    const parts = clean.split(".");
    if (parts.length !== 3) return null;
    try {
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "===".slice((b64.length + 3) % 4);
      const binary = atob(padded);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const jsonStr = new TextDecoder("utf-8").decode(bytes);
      return JSON.parse(jsonStr);
    } catch {
      return null;
    }
  }

  function scanBrowserStorage() {
    const foundObjects = [];
    const stores = [window.localStorage, window.sessionStorage];
    for (const st of stores) {
      if (!st) continue;
      try {
        for (let i = 0; i < st.length; i++) {
          const k = st.key(i);
          if (!k || k.startsWith("unifs_")) continue;
          const raw = st.getItem(k);
          if (!raw) continue;
          const trimmed = raw.trim();
          if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
            try {
              foundObjects.push({ key: k, data: JSON.parse(trimmed) });
            } catch {
              // ignore
            }
          } else if (trimmed.split(".").length === 3 && trimmed.length > 40) {
            const jwtObj = decodeJwtPayload(trimmed);
            if (jwtObj) foundObjects.push({ key: `jwt:${k}`, data: jwtObj });
          }
        }
      } catch {
        // ignore storage error
      }
    }

    if (window.__NEXT_DATA__?.props) {
      foundObjects.push({ key: "__NEXT_DATA__", data: window.__NEXT_DATA__.props });
    }

    return foundObjects;
  }

  function flushStateToContentScript() {
    try {
      const storageItems = scanBrowserStorage();
      const msg = {
        source: "UNIFS_MAIN_HOOK",
        type: "FAP_HOOK_DUMP",
        payload: {
          apis: window.__UNIFS_CAPTURED_APIS__ || [],
          storage: storageItems,
        },
      };
      window.postMessage(msg, "*");
      if (window.top && window.top !== window) {
        window.top.postMessage(msg, "*");
      }
    } catch {
      // ignore
    }
  }

  window.addEventListener("message", (evt) => {
    if (evt.data?.source === "UNIFS_CONTENT_REQ" && evt.data?.type === "REQUEST_HOOK_DUMP") {
      flushStateToContentScript();
    }
  });
})();
