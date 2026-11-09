const EXT_TOKEN_KEY = "unifs_ext_token";
const EXT_SERVER_KEY = "unifs_ext_server_url";
const EXT_THEME_KEY = "unifs_ext_theme";

export function getServerUrl() {
  return (localStorage.getItem(EXT_SERVER_KEY) || "http://localhost:8000").replace(/\/+$/, "");
}

export function setServerUrl(url) {
  const clean = (url || "http://localhost:8000").trim().replace(/\/+$/, "");
  localStorage.setItem(EXT_SERVER_KEY, clean);
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    chrome.storage.local.set({ unifs_server_url: clean }).catch(() => {});
  }
  return clean;
}

export function getExtToken() {
  return localStorage.getItem(EXT_TOKEN_KEY) || "";
}

export function setExtToken(token) {
  if (token) {
    localStorage.setItem(EXT_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(EXT_TOKEN_KEY);
  }
}

export function getExtTheme() {
  return localStorage.getItem(EXT_THEME_KEY) || "dark";
}

export function setExtTheme(theme) {
  localStorage.setItem(EXT_THEME_KEY, theme);
}

export async function extApiRequest(path, options = {}) {
  const base = getServerUrl();
  const token = getExtToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${base}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errData = {};
    let errMsg = `Lỗi kết nối (${res.status})`;
    try {
      errData = await res.json();
      errMsg = errData.detail || errData.message || errMsg;
    } catch {
      // ignore parse error
    }
    const err = new Error(errMsg);
    err.status = res.status;
    err.data = errData;
    throw err;
  }

  return res.json();
}

export async function extStreamChat({ prompt, threadId, onMeta, onToken, onTools, onDone }) {
  const base = getServerUrl();
  const token = getExtToken();
  const res = await fetch(`${base}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      prompt,
      thread_id: threadId || null,
    }),
  });

  if (!res.ok) {
    let errMsg = `Không thể kết nối AI Server (${res.status})`;
    try {
      const data = await res.json();
      errMsg = data.detail || errMsg;
    } catch {
      // ignore
    }
    throw new Error(errMsg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;
      try {
        const evt = JSON.parse(jsonStr);
        if (evt.type === "meta" && onMeta) onMeta(evt);
        else if (evt.type === "token" && onToken) onToken(evt.text);
        else if (evt.type === "tools" && onTools) onTools(evt.tools || []);
        else if (evt.type === "done" && onDone) onDone(evt.thread);
      } catch {
        // skip
      }
    }
  }
}
