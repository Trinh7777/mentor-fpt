const TOKEN_KEY = "unifs_pro_token";
const THEME_KEY = "unifs_pro_theme";

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setStoredToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

export async function apiRequest(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errMsg = `Lỗi máy chủ (${res.status})`;
    try {
      const data = await res.json();
      errMsg = data.detail || data.message || errMsg;
    } catch {
      // ignore json parse error
    }
    const err = new Error(errMsg);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export async function streamChatMessage({ prompt, threadId, onMeta, onToken, onTools, onDone }) {
  const token = getStoredToken();
  const res = await fetch("/api/chat/stream", {
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
    let errMsg = `Không thể kết nối AI (${res.status})`;
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
        // skip malformed chunk
      }
    }
  }
}

export function evaluatePasswordStrength(password) {
  const pwd = (password || "").trim();
  const checks = {
    minLength: pwd.length >= 6,
    hasLetterAndNumber: /[A-Za-z]/.test(pwd) && /\d/.test(pwd),
    hasUpperLower: /[a-z]/.test(pwd) && /[A-Z]/.test(pwd),
    hasSpecialOrLong: /[^A-Za-z0-9]/.test(pwd) || pwd.length >= 10,
  };
  const score = [
    checks.minLength,
    checks.hasLetterAndNumber,
    checks.hasUpperLower,
    checks.hasSpecialOrLong,
  ].filter(Boolean).length;

  const labels = ["Chưa đạt", "Yếu", "Khá", "Mạnh", "Siêu mạnh"];
  const colors = [
    "bg-slate-500",
    "bg-rose-500",
    "bg-amber-500",
    "bg-sky-500",
    "bg-emerald-500",
  ];
  const textColors = [
    "text-slate-400",
    "text-rose-400",
    "text-amber-400",
    "text-sky-400",
    "text-emerald-400",
  ];

  return {
    score: pwd.length === 0 ? 0 : Math.max(score, 1),
    checks,
    label: pwd.length === 0 ? "Nhập mật khẩu" : labels[score],
    barColor: colors[pwd.length === 0 ? 0 : Math.max(score, 1)],
    textColor: textColors[pwd.length === 0 ? 0 : Math.max(score, 1)],
  };
}

export function formatVND(amount) {
  if (amount == null || isNaN(amount)) return "0đ";
  return `${Math.round(amount).toLocaleString("vi-VN")}đ`;
}
