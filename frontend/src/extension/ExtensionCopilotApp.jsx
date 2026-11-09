import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Bot,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Mail,
  Maximize2,
  Minimize2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
  UserCheck,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { evaluatePasswordStrength, formatVND } from "../lib/api";
import {
  extApiRequest,
  extStreamChat,
  getExtTheme,
  getExtToken,
  getServerUrl,
  setExtTheme,
  setExtToken,
  setServerUrl,
} from "./extApi";
import {
  answerLocallyFromSnapshot,
  buildMetricsFromSnapshot,
  calcRequiredFeLocal,
} from "./localAnalyzer";

marked.setOptions({ gfm: true, breaks: true });

const WORKER_LABELS = [
  { key: "profile", label: "Hồ sơ" },
  { key: "transcript", label: "Bảng điểm" },
  { key: "coursework", label: "Điểm TP" },
  { key: "schedule", label: "Lịch tuần" },
  { key: "attendance", label: "Điểm danh" },
];

function isEmbeddedDrawer() {
  return new URLSearchParams(window.location.search).get("mode") === "drawer";
}

function sendCommandToParent(type, payload = {}) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({ source: "UNIFS_COPILOT", type, payload }, "*");
  }
}

export default function ExtensionCopilotApp() {
  const inDrawer = isEmbeddedDrawer();
  const mascotSrc = useMemo(() => {
    if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
      return chrome.runtime.getURL("icons/mascot.png");
    }
    return "./icons/mascot.png";
  }, []);

  const [theme, setTheme] = useState(getExtTheme);
  const dark = theme === "dark";
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // chat | fap | tools | account

  // Crawl & Snapshot state
  const [isCrawling, setIsCrawling] = useState(false);
  const [workerStates, setWorkerStates] = useState({
    profile: { status: "idle", detail: "" },
    transcript: { status: "idle", detail: "" },
    coursework: { status: "idle", detail: "" },
    schedule: { status: "idle", detail: "" },
    attendance: { status: "idle", detail: "" },
  });
  const [snapshot, setSnapshot] = useState(null);
  const [currentPage, setCurrentPage] = useState(null);
  const [syncMeta, setSyncMeta] = useState(null);

  // Server & Auth state
  const [serverUrlInput, setServerUrlInput] = useState(getServerUrl);
  const [serverOnline, setServerOnline] = useState(true);
  const [aiMode, setAiMode] = useState("gemini");
  const [campuses, setCampuses] = useState(["Hà Nội", "TP.HCM", "Đà Nẵng", "Cần Thơ", "Quy Nhơn"]);
  const [student, setStudent] = useState(null);
  const studentRef = useRef(null);
  const lastConnectedSidRef = useRef("");
  const [overview, setOverview] = useState(null);
  const [authLogs, setAuthLogs] = useState([]);
  const [requiresAuthModal, setRequiresAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // login | forgot_1 | forgot_2 | forgot_3
  const [authIdentifier, setAuthIdentifier] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authNotice, setAuthNotice] = useState(null);

  // OTP Reset state
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpMeta, setOtpMeta] = useState(null);
  const [resetToken, setResetToken] = useState("");
  const [resetNewPwd, setResetNewPwd] = useState("");
  const [resetConfirmPwd, setResetConfirmPwd] = useState("");
  const otpRefs = useRef([]);

  // Change Password state (Account tab)
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmNewPwd, setConfirmNewPwd] = useState("");
  const [pwdMsg, setPwdMsg] = useState(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  // Chat state
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef(null);

  // FAP Data UI state
  const [expandedAttCode, setExpandedAttCode] = useState(null);
  const [transcriptQuery, setTranscriptQuery] = useState("");

  // Tools state (FE & GPA Simulator)
  const [selectedFeCode, setSelectedFeCode] = useState("");
  const [feCwAvg, setFeCwAvg] = useState(7.2);
  const [feWeightPct, setFeWeightPct] = useState(40);
  const [feTarget, setFeTarget] = useState(5.0);
  const [feServerRes, setFeServerRes] = useState(null);
  const [simGrades, setSimGrades] = useState({});
  const [simResult, setSimResult] = useState(null);

  const localMetrics = useMemo(() => buildMetricsFromSnapshot(snapshot), [snapshot]);

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setTheme(next);
    setExtTheme(next);
  };

  // Load Backend Overview & Threads once authenticated
  const loadAuthenticatedBundle = useCallback(async () => {
    const tok = getExtToken();
    if (!tok) return null;
    try {
      const [meRes, ovRes, thrRes] = await Promise.all([
        extApiRequest("/api/auth/me"),
        extApiRequest("/api/dashboard/overview"),
        extApiRequest("/api/chat/threads"),
      ]);
      setServerOnline(true);
      studentRef.current = meRes.student;
      setStudent(meRes.student);
      setAuthLogs(meRes.auth_logs || []);
      if (meRes.campuses?.length) setCampuses(meRes.campuses);
      setOverview(ovRes);
      const list = thrRes.threads || [];
      setThreads(list);
      if (list.length > 0) {
        const firstId = list[0].thread_id;
        setActiveThreadId(firstId);
        const detail = await extApiRequest(`/api/chat/threads/${firstId}`);
        setMessages(detail.messages || []);
      } else {
        setActiveThreadId(null);
        setMessages([]);
      }
      setRequiresAuthModal(false);
      return meRes.student;
    } catch (err) {
      if (err.status === 401) {
        setExtToken("");
        setStudent(null);
      } else {
        setServerOnline(false);
      }
      return null;
    }
  }, []);

  // Auto Quick-Login with active FAP Student ID!
  const attemptFapSessionConnect = useCallback(
    async (fapSid, fapCampus, forceRefresh = false) => {
      if (!fapSid) return;
      if (!forceRefresh && lastConnectedSidRef.current === fapSid && studentRef.current?.student_id === fapSid) {
        return;
      }
      lastConnectedSidRef.current = fapSid;

      try {
        const health = await extApiRequest("/api/health");
        setServerOnline(true);
        setAiMode(health.ai_mode || "gemini");
      } catch {
        setServerOnline(false);
        return;
      }

      // Nếu đã đăng nhập đúng MSSV đang mở trên FAP -> làm mới dữ liệu overview 1 lần!
      if (getExtToken() && studentRef.current && studentRef.current.student_id === fapSid) {
        await loadAuthenticatedBundle();
        return;
      }

      // Kiểm tra xem token hiện tại có phải của cùng MSSV không
      if (getExtToken()) {
        try {
          const me = await extApiRequest("/api/auth/me");
          if (me.student?.student_id === fapSid) {
            await loadAuthenticatedBundle();
            return;
          }
        } catch {
          setExtToken("");
        }
      }

      // Thử đăng nhập nhanh 1-click theo phiên FAP
      try {
        const quick = await extApiRequest("/api/auth/fap-quick-login", {
          method: "POST",
          body: JSON.stringify({ student_id: fapSid, campus: fapCampus || "Hà Nội" }),
        });
        setExtToken(quick.token);
        studentRef.current = quick.student;
        setStudent(quick.student);
        setRequiresAuthModal(false);
        await loadAuthenticatedBundle();
      } catch (err) {
        if (err.status === 403 && err.data?.code === "REQUIRES_PASSWORD") {
          studentRef.current = null;
          setStudent(null);
          setExtToken("");
          setAuthIdentifier(fapSid);
          setRequiresAuthModal(true);
          setAuthNotice({
            tone: "info",
            text: `Tài khoản ${fapSid} đã đặt mật khẩu bảo mật riêng. Vui lòng nhập mật khẩu (hoặc bấm Quên mật khẩu OTP).`,
          });
        }
      }
    },
    [loadAuthenticatedBundle]
  );

  // Listen to messages from content.js (when inside FAP Drawer) + load chrome.storage (when inside Popup/SidePanel)
  useEffect(() => {
    const handleWindowMsg = (event) => {
      const msg = event.data;
      if (!msg || msg.source !== "UNIFS_CONTENT") return;

      if (msg.type === "UNIFS_STATE_INIT") {
        setIsCrawling(Boolean(msg.payload.isCrawling));
        if (msg.payload.workerStates) setWorkerStates(msg.payload.workerStates);
        if (msg.payload.expanded !== undefined) setExpanded(Boolean(msg.payload.expanded));
        if (msg.payload.currentPage) setCurrentPage(msg.payload.currentPage);
        if (msg.payload.syncMeta) setSyncMeta(msg.payload.syncMeta);
        if (msg.payload.snapshot) {
          setSnapshot(msg.payload.snapshot);
          if (msg.payload.snapshot.student_id) {
            attemptFapSessionConnect(msg.payload.snapshot.student_id, msg.payload.snapshot.campus);
          }
        }
      } else if (msg.type === "UNIFS_CRAWL_STARTED") {
        setIsCrawling(true);
      } else if (msg.type === "UNIFS_CRAWL_PROGRESS") {
        if (msg.payload.workerStates) setWorkerStates({ ...msg.payload.workerStates });
      } else if (msg.type === "UNIFS_CRAWL_COMPLETE") {
        setIsCrawling(false);
        if (msg.payload.workerStates) setWorkerStates({ ...msg.payload.workerStates });
        if (msg.payload.syncMeta) {
          setSyncMeta(msg.payload.syncMeta);
          setServerOnline(Boolean(msg.payload.syncMeta.server_online));
        }
        if (msg.payload.snapshot) {
          setSnapshot(msg.payload.snapshot);
          if (msg.payload.snapshot.current_page) setCurrentPage(msg.payload.snapshot.current_page);
          if (msg.payload.snapshot.student_id) {
            attemptFapSessionConnect(msg.payload.snapshot.student_id, msg.payload.snapshot.campus, true);
          }
        }
      } else if (msg.type === "UNIFS_CRAWL_ERROR") {
        setIsCrawling(false);
      } else if (msg.type === "UNIFS_DRAWER_SIZE") {
        setExpanded(Boolean(msg.payload.expanded));
      }
    };

    window.addEventListener("message", handleWindowMsg);

    if (inDrawer) {
      sendCommandToParent("UNIFS_CMD_GET_STATE");
    } else if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({ type: "UNIFS_GET_LATEST_STATE" }, (res) => {
        if (res?.snapshot) {
          setSnapshot(res.snapshot);
          setCurrentPage(res.snapshot.current_page || null);
          if (res.snapshot.student_id) {
            attemptFapSessionConnect(res.snapshot.student_id, res.snapshot.campus);
          }
        } else {
          loadAuthenticatedBundle();
        }
        if (res?.sync_status) setSyncMeta(res.sync_status);
      });
    } else {
      loadAuthenticatedBundle();
    }

    return () => window.removeEventListener("message", handleWindowMsg);
  }, [attemptFapSessionConnect, inDrawer, loadAuthenticatedBundle]);

  // Pre-fill FE Calculator & What-If Simulator whenever crawled coursework/studying changes
  useEffect(() => {
    const cwCourses = overview?.coursework?.courses || localMetrics?.courseworkList || [];
    if (cwCourses.length > 0 && !selectedFeCode) {
      const first = cwCourses[0];
      setSelectedFeCode(first.subject_code);
      if (first.coursework_average != null) setFeCwAvg(first.coursework_average);
      if (first.fe_weight != null) setFeWeightPct(Math.round(first.fe_weight * 100));
    }

    const studyingList = overview?.progress?.studying || localMetrics?.studying || [];
    if (studyingList.length > 0 && Object.keys(simGrades).length === 0) {
      const initSim = {};
      studyingList.forEach((s) => {
        initSim[s.subject_code] = 8.0;
      });
      setSimGrades(initSim);
    }
  }, [overview, localMetrics, selectedFeCode, simGrades]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  // Trigger Parallel Crawl
  const handleTriggerParallelCrawl = () => {
    if (inDrawer) {
      setIsCrawling(true);
      sendCommandToParent("UNIFS_CMD_CRAWL");
    } else if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      setIsCrawling(true);
      chrome.runtime.sendMessage({ type: "UNIFS_REQUEST_ACTIVE_TAB_CRAWL" }, (resp) => {
        setIsCrawling(false);
        if (resp?.snapshot) {
          setSnapshot(resp.snapshot);
          if (resp.snapshot.student_id) {
            attemptFapSessionConnect(resp.snapshot.student_id, resp.snapshot.campus);
          }
        } else if (resp?.error) {
          setAuthNotice({ tone: "warning", text: resp.error });
        }
      });
    }
  };

  // Send Chat Prompt (SSE Stream when Backend online, Local Analyzer fallback when offline)
  const sendPrompt = async (rawText) => {
    const prompt = (rawText ?? chatInput).trim();
    if (!prompt || streaming) return;
    setChatInput("");
    setActiveTab("chat");

    const userMsg = { role: "user", content: prompt };
    const assistantPlaceholder = { role: "assistant", content: "", tools: [], streaming: true };
    setMessages((prev) => [...prev, userMsg, assistantPlaceholder]);
    setStreaming(true);

    if (!serverOnline || !getExtToken()) {
      // Trả lời tức thì từ dữ liệu Parallel Crawl cục bộ!
      const localReply = answerLocallyFromSnapshot(prompt, snapshot);
      setTimeout(() => {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = {
            role: "assistant",
            content: localReply,
            tools: [{ tool: "fap_parallel_snapshot_analyzer" }],
            streaming: false,
          };
          return copy;
        });
        setStreaming(false);
      }, 180);
      return;
    }

    let acc = "";
    try {
      await extStreamChat({
        prompt,
        threadId: activeThreadId,
        onMeta: (meta) => {
          if (meta.thread_id) setActiveThreadId(meta.thread_id);
        },
        onToken: (chunk) => {
          acc += chunk;
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, content: acc };
            }
            return copy;
          });
        },
        onTools: (tools) => {
          setMessages((prev) => {
            const copy = [...prev];
            const last = copy[copy.length - 1];
            if (last && last.role === "assistant") {
              copy[copy.length - 1] = { ...last, tools };
            }
            return copy;
          });
        },
        onDone: async () => {
          const thrRes = await extApiRequest("/api/chat/threads").catch(() => null);
          if (thrRes?.threads) setThreads(thrRes.threads);
        },
      });
    } catch (err) {
      const fallbackReply = answerLocallyFromSnapshot(prompt, snapshot);
      setMessages((prev) => {
        const copy = [...prev];
        copy[copy.length - 1] = {
          role: "assistant",
          content: `${fallbackReply}\n\n*(Ghi chú: ${err.message})*`,
          tools: [{ tool: "local_fap_fallback" }],
          streaming: false,
        };
        return copy;
      });
    } finally {
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === "assistant") {
          copy[copy.length - 1] = { ...last, streaming: false };
        }
        return copy;
      });
      setStreaming(false);
    }
  };

  const handleAnalyzeCurrentFapPage = () => {
    const pg = currentPage || snapshot?.current_page;
    if (!pg) {
      sendPrompt(
        "Phân tích toàn diện dữ liệu FAP vừa kéo song song của mình (GPA, điểm thành phần, điểm danh AF và lộ trình kỳ tới)!"
      );
      return;
    }
    sendPrompt(
      `Mình đang mở trang "${pg.title}" (${pg.path}) trên FAP. Dựa vào dữ liệu học vụ vừa đồng bộ song song của mình, hãy phân tích các con số quan trọng nhất trên trang này, cảnh báo rủi ro (nếu có) và gợi ý hành động cụ thể!`
    );
  };

  // Auth Handlers (Login, OTP Forgot Password, Change Password)
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const res = await extApiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: authIdentifier,
          password: authPassword,
          campus: snapshot?.campus || "Hà Nội",
          remember_me: true,
        }),
      });
      setExtToken(res.token);
      setAuthPassword("");
      await loadAuthenticatedBundle();
    } catch (err) {
      setAuthNotice({ tone: "danger", text: err.message });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const res = await extApiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier: authIdentifier }),
      });
      setOtpMeta(res);
      setOtpDigits(["", "", "", "", "", ""]);
      setAuthMode("forgot_2");
    } catch (err) {
      setAuthNotice({ tone: "danger", text: err.message });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const code = otpDigits.join("");
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const res = await extApiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({ identifier: authIdentifier, otp_code: code }),
      });
      setResetToken(res.reset_token);
      setAuthMode("forgot_3");
    } catch (err) {
      setAuthNotice({ tone: "danger", text: err.message });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setAuthBusy(true);
    setAuthNotice(null);
    try {
      const res = await extApiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: resetNewPwd,
          confirm_password: resetConfirmPwd,
        }),
      });
      setAuthMode("login");
      setAuthPassword(resetNewPwd);
      setResetNewPwd("");
      setResetConfirmPwd("");
      setAuthNotice({ tone: "success", text: res.message });
    } catch (err) {
      setAuthNotice({ tone: "danger", text: err.message });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      const res = await extApiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          old_password: oldPwd,
          new_password: newPwd,
          confirm_password: confirmNewPwd,
        }),
      });
      setOldPwd("");
      setNewPwd("");
      setConfirmNewPwd("");
      setAuthLogs(res.auth_logs || []);
      setPwdMsg({ tone: "success", text: res.message });
    } catch (err) {
      setPwdMsg({ tone: "danger", text: err.message });
    } finally {
      setPwdBusy(false);
    }
  };

  // Run FE Calc
  useEffect(() => {
    const localRes = calcRequiredFeLocal(feCwAvg, feWeightPct / 100, feTarget);
    setFeServerRes(localRes);
  }, [feCwAvg, feWeightPct, feTarget]);

  // Run What-If GPA Simulation
  const handleRunSimulation = async () => {
    if (serverOnline && getExtToken()) {
      try {
        const res = await extApiRequest("/api/tools/simulate-gpa", {
          method: "POST",
          body: JSON.stringify({ expected_grades: simGrades }),
        });
        setSimResult(res);
        return;
      } catch {
        // fallback below
      }
    }
    if (localMetrics) {
      const entries = Object.entries(simGrades);
      const semAvg =
        entries.reduce((s, [, g]) => s + Number(g), 0) / Math.max(entries.length, 1);
      const oldCr = localMetrics.gpaCredits || 0;
      const oldPts = (localMetrics.gpa || 0) * oldCr;
      const addCr = entries.length * 3;
      const newGpa =
        oldCr + addCr > 0
          ? Math.round(((oldPts + semAvg * addCr) / (oldCr + addCr)) * 100) / 100
          : Math.round(semAvg * 100) / 100;
      setSimResult({
        semester_gpa_projected: Math.round(semAvg * 100) / 100,
        cumulative_gpa_before: localMetrics.gpa || 0,
        cumulative_gpa_after: newGpa,
        gpa_delta: Math.round((newGpa - (localMetrics.gpa || 0)) * 100) / 100,
      });
    }
  };

  // Unified display data (merges Backend Overview + Live FAP Snapshot)
  const displaySid = student?.student_id || snapshot?.student_id || "FAP";
  const displayName = student?.full_name || snapshot?.full_name || "Sinh viên FPTU";
  const displayGpa = overview?.gpa?.gpa ?? localMetrics?.gpa;
  const displayClass = overview?.gpa?.classification || localMetrics?.classification || "Đang tính";
  const displayCreditsPassed = overview?.progress?.credits_passed ?? localMetrics?.creditsPassed ?? 0;
  const displayCreditsTotal = overview?.progress?.credits_total ?? 145;
  const attList = useMemo(() => {
    if (overview?.attendance?.courses?.length) return overview.attendance.courses;
    if (localMetrics?.attCourses?.length) return localMetrics.attCourses;
    if (overview?.attendance?.subject_code) return [overview.attendance];
    return [];
  }, [overview, localMetrics]);

  const cwList = useMemo(() => {
    if (overview?.coursework?.courses?.length) return overview.coursework.courses;
    if (localMetrics?.courseworkList?.length) return localMetrics.courseworkList;
    return [];
  }, [overview, localMetrics]);

  const transcriptRows = useMemo(() => {
    const raw = overview?.transcript?.rows || localMetrics?.transcriptRows || [];
    if (!transcriptQuery.trim()) return raw;
    const q = transcriptQuery.trim().toLowerCase();
    return raw.filter(
      (r) =>
        r.subject_code?.toLowerCase().includes(q) ||
        r.subject_name?.toLowerCase().includes(q)
    );
  }, [overview, localMetrics, transcriptQuery]);

  const afCount = attList.filter((c) => c.is_attendance_fail).length;
  const newPwdStrength = evaluatePasswordStrength(newPwd);
  const resetPwdStrength = evaluatePasswordStrength(resetNewPwd);

  const surfaceCls = dark
    ? "bg-[#070b14] text-slate-100"
    : "bg-slate-50 text-slate-900";
  const cardCls = dark
    ? "bg-slate-900/85 border-slate-800 text-slate-100"
    : "bg-white border-slate-200 text-slate-900 shadow-xs";

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden select-none sm:select-auto ${surfaceCls}`}>
      {/* TOP HEADER BAR */}
      <header
        className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-2 shrink-0 ${
          dark ? "bg-slate-950/90 border-slate-800/90" : "bg-white border-slate-200"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#f37021]/25 to-sky-500/20 border border-[#f37021]/40 flex items-center justify-center shrink-0">
            <img src={mascotSrc} alt="UniFs" className="w-7 h-7 object-contain" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-sm tracking-tight truncate">UniFs FAP Copilot</span>
              <span
                className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                  serverOnline
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {serverOnline ? (aiMode === "gemini" ? "Gemini AI" : "Online") : "Local"}
              </span>
            </div>
            <div className="text-[11px] opacity-75 truncate">
              {displaySid !== "FAP" ? `${displayName} (${displaySid})` : "Đang nhận diện phiên FAP..."}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleTriggerParallelCrawl}
            disabled={isCrawling}
            title="Kéo song song toàn bộ 5 trang FAP ngay lập tức"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-gradient-to-r from-[#f37021] to-orange-500 text-white shadow-sm hover:brightness-110 disabled:opacity-60 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? "animate-spin" : ""}`} />
            <span className="hidden xs:inline">{isCrawling ? "Đang kéo..." : "Kéo FAP"}</span>
          </button>

          <button
            onClick={toggleTheme}
            title="Đổi giao diện Sáng / Tối"
            className="p-1.5 rounded-lg hover:bg-slate-500/15 transition cursor-pointer"
          >
            {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
          </button>

          <a
            href={getServerUrl()}
            target="_blank"
            rel="noreferrer"
            title="Mở bản Full Web Studio trên tab mới"
            className="p-1.5 rounded-lg hover:bg-slate-500/15 transition"
          >
            <ExternalLink className="w-4 h-4 opacity-75" />
          </a>

          {inDrawer && (
            <>
              <button
                onClick={() => sendCommandToParent("UNIFS_CMD_TOGGLE_EXPAND")}
                title={expanded ? "Thu gọn về ngăn kéo bên phải" : "Mở rộng toàn màn hình trên FAP"}
                className="p-1.5 rounded-lg hover:bg-slate-500/15 transition cursor-pointer"
              >
                {expanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                onClick={() => sendCommandToParent("UNIFS_CMD_CLOSE")}
                title="Thu nhỏ Copilot (Alt+U)"
                className="p-1.5 rounded-lg hover:bg-rose-500/20 hover:text-rose-400 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* LIVE 5-WORKER PARALLEL SYNC BAR */}
      <div
        className={`px-3 py-1.5 border-b flex items-center justify-between gap-2 overflow-x-auto shrink-0 text-[10.5px] ${
          dark ? "bg-slate-900/70 border-slate-800/80" : "bg-slate-100/90 border-slate-200"
        }`}
      >
        <div className="flex items-center gap-1.5 shrink-0">
          {WORKER_LABELS.map((w) => {
            const st = workerStates[w.key]?.status || "idle";
            const det = workerStates[w.key]?.detail;
            return (
              <span
                key={w.key}
                title={det ? `${w.label}: ${det}` : w.label}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold border max-w-[145px] truncate ${
                  st === "done"
                    ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-400"
                    : st === "running"
                    ? "bg-sky-500/15 border-sky-500/35 text-sky-400 animate-pulse"
                    : st === "error"
                    ? "bg-rose-500/12 border-rose-500/30 text-rose-400"
                    : "bg-slate-500/10 border-slate-500/20 opacity-75"
                }`}
              >
                <span>{w.label}</span>
                {det && <span className="opacity-85 font-mono truncate">({det})</span>}
              </span>
            );
          })}
        </div>
        {snapshot?.crawl_duration_ms != null && (
          <span className="font-mono opacity-65 shrink-0">⚡ {snapshot.crawl_duration_ms}ms</span>
        )}
      </div>

      {/* AUTH GATE MODAL OVERLAY (IF CUSTOM PASSWORD REQUIRED OR USER SWITCHING ACCOUNT) */}
      {requiresAuthModal ? (
        <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
          <div className={`w-full max-w-sm p-5 rounded-2xl border space-y-4 ${cardCls}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-[#f37021]" />
                <h2 className="font-extrabold text-base">
                  {authMode === "login"
                    ? "Xác thực Tài khoản UniFs"
                    : authMode === "forgot_1"
                    ? "Quên / Reset mật khẩu OTP"
                    : authMode === "forgot_2"
                    ? "Nhập mã OTP 6 chữ số"
                    : "Thiết lập mật khẩu mới"}
                </h2>
              </div>
              {snapshot && (
                <button
                  onClick={() => setRequiresAuthModal(false)}
                  title="Xem dữ liệu FAP cục bộ"
                  className="text-xs opacity-70 hover:opacity-100 cursor-pointer"
                >
                  Đóng
                </button>
              )}
            </div>

            {snapshot?.student_id && authMode === "login" && (
              <button
                type="button"
                onClick={() => attemptFapSessionConnect(snapshot.student_id, snapshot.campus)}
                className="w-full py-2 px-3 rounded-xl text-xs font-bold bg-emerald-500/15 border border-emerald-500/35 text-emerald-400 hover:bg-emerald-500/25 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Thử kết nối 1-Click theo phiên FAP ({snapshot.student_id})</span>
              </button>
            )}

            {authNotice && (
              <div
                className={`p-3 rounded-xl text-xs border ${
                  authNotice.tone === "danger"
                    ? "bg-rose-500/12 border-rose-500/35 text-rose-400"
                    : authNotice.tone === "success"
                    ? "bg-emerald-500/12 border-emerald-500/35 text-emerald-400"
                    : "bg-sky-500/12 border-sky-500/35 text-sky-300"
                }`}
              >
                {authNotice.text}
              </div>
            )}

            {authMode === "login" && (
              <form onSubmit={handleLoginSubmit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold opacity-80 block mb-1">MSSV hoặc Email FPT</label>
                  <input
                    type="text"
                    required
                    value={authIdentifier}
                    onChange={(e) => setAuthIdentifier(e.target.value)}
                    placeholder="VD: SE190456 hoặc se190456@fpt.edu.vn"
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-300"
                    }`}
                  />
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <label className="text-xs font-semibold opacity-80">Mật khẩu</label>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode("forgot_1");
                        setAuthNotice(null);
                      }}
                      className="text-[11px] font-bold text-[#f37021] hover:underline cursor-pointer"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type={showPwd ? "text" : "password"}
                      required
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Mặc định 123456 nếu chưa đổi"
                      className={`w-full pl-3 pr-9 py-2 rounded-xl border text-xs outline-none ${
                        dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-300"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(!showPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-65 cursor-pointer"
                    >
                      {showPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-[#f37021] to-orange-500 text-white hover:brightness-110 cursor-pointer"
                >
                  {authBusy ? "Đang đăng nhập..." : "Đăng nhập vào Copilot"}
                </button>
              </form>
            )}

            {authMode === "forgot_1" && (
              <form onSubmit={handleRequestOtp} className="space-y-3">
                <p className="text-xs opacity-75">
                  Nhập MSSV hoặc Email FPT để nhận mã xác thực OTP 6 chữ số khôi phục mật khẩu:
                </p>
                <input
                  type="text"
                  required
                  value={authIdentifier}
                  onChange={(e) => setAuthIdentifier(e.target.value)}
                  placeholder="VD: SE190456"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-300"
                  }`}
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold border border-slate-600/40 cursor-pointer"
                  >
                    Quay lại
                  </button>
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="flex-1 py-2 rounded-xl text-xs font-bold bg-[#f37021] text-white cursor-pointer"
                  >
                    {authBusy ? "Đang gửi..." : "Gửi mã OTP"}
                  </button>
                </div>
              </form>
            )}

            {authMode === "forgot_2" && (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="text-xs opacity-80">
                  Mã OTP đã tạo cho <b>{otpMeta?.masked_email}</b>.
                </div>
                {otpMeta?.demo_otp && (
                  <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs flex items-center justify-between">
                    <span>
                      Demo OTP: <b className="font-mono text-sm">{otpMeta.demo_otp}</b>
                    </span>
                    <button
                      type="button"
                      onClick={() => setOtpDigits(otpMeta.demo_otp.split(""))}
                      className="px-2 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                    >
                      Điền nhanh
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-6 gap-1.5">
                  {otpDigits.map((d, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (otpRefs.current[idx] = el)}
                      type="text"
                      maxLength={1}
                      value={d}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, "");
                        const next = [...otpDigits];
                        next[idx] = val;
                        setOtpDigits(next);
                        if (val && idx < 5) otpRefs.current[idx + 1]?.focus();
                      }}
                      className={`h-10 text-center font-mono font-extrabold text-sm rounded-xl border outline-none ${
                        dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-300"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="submit"
                  disabled={authBusy || otpDigits.join("").length < 6}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-[#f37021] text-white cursor-pointer"
                >
                  Xác minh OTP
                </button>
              </form>
            )}

            {authMode === "forgot_3" && (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <input
                  type="password"
                  required
                  value={resetNewPwd}
                  onChange={(e) => setResetNewPwd(e.target.value)}
                  placeholder="Mật khẩu mới (>= 6 ký tự, chữ & số)"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-300"
                  }`}
                />
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((lv) => (
                    <div
                      key={lv}
                      className={`h-1 rounded-full ${
                        resetPwdStrength.score >= lv ? resetPwdStrength.barColor : "bg-slate-700/40"
                      }`}
                    />
                  ))}
                </div>
                <input
                  type="password"
                  required
                  value={resetConfirmPwd}
                  onChange={(e) => setResetConfirmPwd(e.target.value)}
                  placeholder="Xác nhận mật khẩu mới"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    dark ? "bg-slate-950 border-slate-700" : "bg-slate-50 border-slate-300"
                  }`}
                />
                <button
                  type="submit"
                  disabled={authBusy}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-emerald-500 text-white cursor-pointer"
                >
                  Hoàn tất đặt lại mật khẩu
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* NAVIGATION TABS */}
          <nav
            className={`px-2.5 pt-2 border-b grid grid-cols-4 gap-1 shrink-0 ${
              dark ? "bg-slate-950/60 border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            {[
              { id: "chat", label: "Hỏi AI", icon: Bot },
              { id: "fap", label: "Dữ liệu FAP", icon: Layers, badge: afCount > 0 ? `${afCount} AF` : null },
              { id: "tools", label: "Tính FE/GPA", icon: Calculator },
              { id: "account", label: "Bảo mật", icon: ShieldCheck },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`pb-2 pt-1.5 px-1 rounded-t-xl text-[11.5px] font-bold flex items-center justify-center gap-1.5 border-b-2 transition cursor-pointer ${
                    active
                      ? "border-[#f37021] text-[#f37021] bg-[#f37021]/8"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                  {tab.badge && (
                    <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-rose-500 text-white font-extrabold">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* TAB 1: AI CHAT & LIVE FAP ANALYZER */}
          {activeTab === "chat" && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Thread selector + Analyze Current Page Button */}
              <div
                className={`px-3 py-2 border-b flex items-center justify-between gap-2 text-xs ${
                  dark ? "border-slate-800/80 bg-slate-900/40" : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <select
                    value={activeThreadId || ""}
                    onChange={async (e) => {
                      const tid = e.target.value;
                      if (!tid) return;
                      setActiveThreadId(tid);
                      const detail = await extApiRequest(`/api/chat/threads/${tid}`).catch(() => null);
                      if (detail) setMessages(detail.messages || []);
                    }}
                    className={`max-w-[180px] truncate px-2 py-1 rounded-lg border text-[11px] outline-none ${
                      dark ? "bg-slate-950 border-slate-800" : "bg-white border-slate-300"
                    }`}
                  >
                    {threads.length === 0 ? (
                      <option value="">Hội thoại FAP mới</option>
                    ) : (
                      threads.map((t) => (
                        <option key={t.thread_id} value={t.thread_id}>
                          {t.title}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    onClick={() => {
                      setActiveThreadId(null);
                      setMessages([]);
                    }}
                    title="Tạo cuộc trò chuyện mới"
                    className="p-1 rounded-lg border border-slate-500/25 hover:bg-slate-500/15 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={handleAnalyzeCurrentFapPage}
                  disabled={streaming}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500/25 transition cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Phân tích trang này</span>
                </button>
              </div>

              {/* Messages Container */}
              <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5">
                {messages.length === 0 ? (
                  <div className="space-y-3.5">
                    {/* Live Crawled Summary Card */}
                    <div className={`p-4 rounded-2xl border ${cardCls}`}>
                      <div className="flex items-start gap-3">
                        <img src={mascotSrc} alt="Mentor" className="w-11 h-11 object-contain shrink-0" />
                        <div className="space-y-1 text-xs">
                          <div className="font-extrabold text-sm">
                            Chào {displayName}! 👋
                          </div>
                          <p className="opacity-80 leading-relaxed">
                            Mình đã kéo song song dữ liệu FAP của bạn về hệ thống: GPA{" "}
                            <b className="text-sky-400">{displayGpa ?? "--"}</b> ({displayClass}), đã tích lũy{" "}
                            <b className="text-emerald-400">{displayCreditsPassed} TC</b>, theo dõi{" "}
                            <b>{attList.length} lớp điểm danh</b> và <b>{cwList.length} bảng điểm thành phần</b>.
                          </p>
                        </div>
                      </div>

                      {snapshot?.portal_mode === "fap_v2_spa" &&
                        (snapshot?.transcript?.length || 0) === 0 &&
                        (overview?.transcript?.count || 0) === 0 && (
                          <div className="mt-3 p-2.5 rounded-xl bg-sky-500/12 border border-sky-500/35 text-sky-300 text-[11.5px] leading-relaxed">
                            📡 <b>Đã bật Bộ bắt gói tin API tự động cho FAP 2.0 mới!</b> Giao diện FAP mới chỉ tải bảng điểm khi bạn mở mục — hãy bấm 1 lần vào{" "}
                            <b>Báo cáo học tập</b> hoặc <b>Lịch học</b> ở menu bên trái FAP, Copilot sẽ tự động hút toàn bộ dữ liệu ngay lập tức!
                          </div>
                        )}

                      {afCount > 0 && (
                        <div className="mt-3 p-2.5 rounded-xl bg-rose-500/12 border border-rose-500/35 text-rose-300 text-[11.5px] flex items-center justify-between gap-2">
                          <span>
                            🚨 Phát hiện <b>{afCount} môn bị cấm thi AF</b> trên FAP!
                          </span>
                          <button
                            onClick={() =>
                              sendPrompt("Phân tích chi tiết môn bị cấm thi AF của mình, học phí học lại và phương án gỡ kỳ tới!")
                            }
                            className="px-2 py-1 rounded-lg bg-rose-500 text-white font-bold text-[10.5px] shrink-0 cursor-pointer"
                          >
                            Xử lý ngay
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Quick FAP Prompt Chips */}
                    <div className="space-y-1.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider opacity-60 px-1">
                        Hỏi nhanh từ dữ liệu FAP vừa kéo về:
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          "🎯 Điểm thành phần kỳ này của mình cần thi FE mấy điểm để qua môn và đạt Giỏi?",
                          "📋 Kiểm tra chi tiết điểm danh tất cả các môn kỳ này, môn nào nguy cơ AF?",
                          "🎓 Dự đoán năm tốt nghiệp, xếp loại bằng và điều kiện đi thực tập OJT của mình!",
                          "💸 Kiểm tra môn đang nợ, tính học phí học lại và gợi ý môn đăng ký kỳ tới!",
                        ].map((q, i) => (
                          <button
                            key={i}
                            onClick={() => sendPrompt(q)}
                            className={`text-left p-2.5 rounded-xl border text-xs font-medium hover:border-[#f37021] transition flex items-center justify-between gap-2 cursor-pointer ${cardCls}`}
                          >
                            <span>{q}</span>
                            <ChevronRight className="w-3.5 h-3.5 text-[#f37021] shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isUser = m.role === "user";
                    return (
                      <div key={idx} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
                            isUser
                              ? "bg-gradient-to-br from-[#f37021] to-orange-600 text-white font-medium"
                              : `border ${cardCls}`
                          }`}
                        >
                          {!isUser && m.tools?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mb-2">
                              {m.tools.map((t, ti) => (
                                <span
                                  key={ti}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono bg-sky-500/15 text-sky-400"
                                >
                                  <Wrench className="w-2.5 h-2.5" />
                                  {t.tool}
                                </span>
                              ))}
                            </div>
                          )}
                          {isUser ? (
                            <div className="whitespace-pre-wrap">{m.content}</div>
                          ) : (
                            <div
                              className="ai-markdown text-xs"
                              dangerouslySetInnerHTML={{
                                __html: marked.parse(
                                  String(m.content || (m.streaming ? "⏳ *Đang phân tích dữ liệu FAP...*" : ""))
                                    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
                                    .replace(/\$\\ge(?:q)?\$/g, "≥")
                                    .replace(/\$\\le(?:q)?\$/g, "≤")
                                    .replace(/\$\\times\$/g, "×")
                                ),
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendPrompt();
                }}
                className={`p-3 border-t flex items-center gap-2 shrink-0 ${
                  dark ? "bg-slate-950/90 border-slate-800" : "bg-white border-slate-200"
                }`}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Hỏi bất kỳ điều gì về điểm, FE, điểm danh, quy chế FPT..."
                  disabled={streaming}
                  className={`flex-1 px-3.5 py-2.5 rounded-xl border text-xs outline-none focus:border-[#f37021] ${
                    dark ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-slate-50 border-slate-300 text-slate-900"
                  }`}
                />
                <button
                  type="submit"
                  disabled={streaming || !chatInput.trim()}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-[#f37021] to-orange-500 text-white disabled:opacity-45 hover:brightness-110 transition cursor-pointer"
                >
                  {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: LIVE PARALLEL FAP ANALYTICS */}
          {activeTab === "fap" && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* 4 Mini KPI Cards */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className={`p-3 rounded-2xl border ${cardCls}`}>
                  <div className="text-[10.5px] uppercase font-bold opacity-65">GPA Tích lũy</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-2xl font-extrabold font-mono text-sky-400">
                      {displayGpa != null ? Number(displayGpa).toFixed(2) : "--"}
                    </span>
                    <span className="text-[11px] font-bold text-sky-400">{displayClass}</span>
                  </div>
                </div>
                <div className={`p-3 rounded-2xl border ${cardCls}`}>
                  <div className="text-[10.5px] uppercase font-bold opacity-65">Tín chỉ tích lũy</div>
                  <div className="mt-1 text-2xl font-extrabold font-mono text-emerald-400">
                    {displayCreditsPassed}
                    <span className="text-xs opacity-70">/{displayCreditsTotal} TC</span>
                  </div>
                </div>
              </div>

              {/* Multi-Subject Attendance AF Radar */}
              <div className={`p-3.5 rounded-2xl border space-y-3 ${cardCls}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-[#f37021]" />
                    <span>Điểm danh Đa môn kỳ hiện tại ({attList.length} lớp)</span>
                  </h3>
                  <button
                    onClick={() => sendPrompt("Phân tích rủi ro điểm danh tất cả các môn kỳ này của mình!")}
                    className="text-[11px] font-bold text-sky-400 hover:underline cursor-pointer"
                  >
                    Hỏi AI →
                  </button>
                </div>

                {attList.length === 0 ? (
                  <div className="text-xs opacity-65 py-3 text-center">
                    Chưa có dữ liệu điểm danh. Hãy bấm <b>Kéo FAP</b> ở góc trên!
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {attList.map((c) => {
                      const isExp = expandedAttCode === c.subject_code;
                      return (
                        <div
                          key={c.subject_code}
                          className={`p-2.5 rounded-xl border ${
                            c.is_attendance_fail
                              ? "border-rose-500/45 bg-rose-500/8"
                              : c.remaining_allowed_absent <= 1
                              ? "border-amber-500/45 bg-amber-500/8"
                              : dark
                              ? "border-slate-800 bg-slate-950/50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <div
                            onClick={() => setExpandedAttCode(isExp ? null : c.subject_code)}
                            className="flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div>
                              <div className="font-mono font-extrabold text-xs flex items-center gap-1.5">
                                <span>{c.subject_code}</span>
                                <span className="font-sans font-normal opacity-75 truncate max-w-[160px]">
                                  {c.subject_name}
                                </span>
                              </div>
                              <div className="text-[11px] opacity-75 mt-0.5">
                                Vắng <b>{c.absent_slots}/{c.total_slots}</b> buổi ({c.absent_rate_total}) ·{" "}
                                {c.is_attendance_fail ? (
                                  <b className="text-rose-400">CẤM THI AF</b>
                                ) : (
                                  <span>Còn phép nghỉ <b>{c.remaining_allowed_absent}</b> buổi</span>
                                )}
                              </div>
                            </div>
                            <ChevronDown
                              className={`w-4 h-4 opacity-60 transition ${isExp ? "rotate-180" : ""}`}
                            />
                          </div>

                          {/* Progress bar */}
                          <div className="mt-2 h-1.5 w-full rounded-full bg-slate-500/20 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                c.is_attendance_fail
                                  ? "bg-rose-500"
                                  : c.remaining_allowed_absent <= 1
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (c.absent_slots / Math.max(c.max_allowed_absent || 4, 1)) * 100
                                )}%`,
                              }}
                            />
                          </div>

                          {isExp && c.records?.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-500/20 grid grid-cols-5 gap-1">
                              {c.records.map((rec, rIdx) => {
                                const st = (rec.status || "").toLowerCase();
                                const pres = st.includes("có mặt") || st.includes("present");
                                const abs = st.includes("vắng") || st.includes("absent");
                                return (
                                  <div
                                    key={rIdx}
                                    title={`Slot ${rIdx + 1} (${rec.date}): ${rec.status}`}
                                    className={`py-1 rounded text-center font-mono text-[10px] font-bold border ${
                                      pres
                                        ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400"
                                        : abs
                                        ? "bg-rose-500/20 border-rose-500/45 text-rose-400"
                                        : "opacity-45 border-slate-600/30"
                                    }`}
                                  >
                                    S{rIdx + 1}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Component Grades & Required FE Table */}
              <div className={`p-3.5 rounded-2xl border space-y-3 ${cardCls}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-400" />
                    <span>Điểm Thành Phần FAP & Mục Tiêu Thi FE ({cwList.length} môn)</span>
                  </h3>
                  <button
                    onClick={() =>
                      sendPrompt("Phân tích bảng điểm thành phần kỳ này và lập chiến lược ôn thi Final Exam cho mình!")
                    }
                    className="text-[11px] font-bold text-sky-400 hover:underline cursor-pointer"
                  >
                    Chiến lược FE →
                  </button>
                </div>

                {cwList.length === 0 ? (
                  <div className="text-xs opacity-65 py-3 text-center">
                    Chưa có điểm thành phần Mark Report kỳ này.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {cwList.map((cw) => (
                      <div
                        key={cw.subject_code}
                        className={`p-2.5 rounded-xl border space-y-2 ${
                          dark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-extrabold text-xs text-sky-400">
                            {cw.subject_code} <span className="font-sans text-slate-400 font-normal">· {cw.subject_name}</span>
                          </span>
                          <span className="text-[11px] font-bold">
                            TB QT: <b className="text-emerald-400 font-mono">{cw.coursework_average ?? "--"}</b>
                          </span>
                        </div>

                        {cw.items?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {cw.items.map((it, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md text-[10px] border border-slate-500/25 font-mono"
                              >
                                {it.name}: <b>{it.value ?? "—"}</b> ({it.weight_pct}%)
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-500/15">
                          <span>
                            Qua môn (5.0):{" "}
                            <b className="font-mono text-[#f37021]">FE &gt;= {cw.required_fe_to_pass ?? "--"}</b>
                          </span>
                          <span>
                            Đạt Giỏi (8.0):{" "}
                            <b className="font-mono text-sky-400">
                              FE &gt;= {cw.required_fe_for_good != null && cw.required_fe_for_good <= 10 ? cw.required_fe_for_good : ">10"}
                            </b>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Compact Searchable Transcript */}
              <div className={`p-3.5 rounded-2xl border space-y-2.5 ${cardCls}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-sky-400" />
                    <span>Bảng điểm toàn khóa ({transcriptRows.length} môn)</span>
                  </h3>
                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
                    <input
                      type="text"
                      value={transcriptQuery}
                      onChange={(e) => setTranscriptQuery(e.target.value)}
                      placeholder="Lọc môn..."
                      className={`pl-7 pr-2.5 py-1 rounded-lg border text-[11px] w-32 outline-none ${
                        dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                      }`}
                    />
                  </div>
                </div>

                <div className="max-h-60 overflow-y-auto divide-y divide-slate-500/15 text-[11.5px]">
                  {transcriptRows.map((r, i) => (
                    <div key={i} className="py-1.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-sky-400 mr-1.5">{r.subject_code}</span>
                        <span className="opacity-80 truncate">{r.subject_name}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 font-mono">
                        <span className="font-bold">{r.grade != null ? r.grade : "—"}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.status === "Passed"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : r.status === "Studying"
                              ? "bg-sky-500/15 text-sky-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}
                        >
                          {r.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: INTERACTIVE FE & WHAT-IF GPA CALCULATORS */}
          {activeTab === "tools" && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* FE Calculator pre-filled from FAP Mark Report */}
              <div className={`p-4 rounded-2xl border space-y-3 ${cardCls}`}>
                <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-[#f37021]" />
                  <span>Máy tính Điểm Final Exam (Tự điền từ FAP Mark Report)</span>
                </h3>

                {cwList.length > 0 && (
                  <div>
                    <label className="text-[11px] opacity-75 block mb-1">Chọn môn đang học trên FAP:</label>
                    <select
                      value={selectedFeCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setSelectedFeCode(code);
                        const found = cwList.find((x) => x.subject_code === code);
                        if (found) {
                          if (found.coursework_average != null) setFeCwAvg(found.coursework_average);
                          if (found.fe_weight != null) setFeWeightPct(Math.round(found.fe_weight * 100));
                        }
                      }}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                        dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                      }`}
                    >
                      {cwList.map((c) => (
                        <option key={c.subject_code} value={c.subject_code}>
                          {c.subject_code} — {c.subject_name} (TB QT: {c.coursework_average ?? "--"})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <label className="text-[10.5px] opacity-70 block mb-1">TB Quá trình</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="10"
                      value={feCwAvg}
                      onChange={(e) => setFeCwAvg(Number(e.target.value))}
                      className={`w-full px-2.5 py-1.5 rounded-xl border font-mono ${
                        dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] opacity-70 block mb-1">% Trọng số FE</label>
                    <input
                      type="number"
                      step="5"
                      min="20"
                      max="60"
                      value={feWeightPct}
                      onChange={(e) => setFeWeightPct(Number(e.target.value))}
                      className={`w-full px-2.5 py-1.5 rounded-xl border font-mono ${
                        dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                      }`}
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] opacity-70 block mb-1">Mục tiêu Tổng</label>
                    <select
                      value={feTarget}
                      onChange={(e) => setFeTarget(Number(e.target.value))}
                      className={`w-full px-2 py-1.5 rounded-xl border font-mono ${
                        dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                      }`}
                    >
                      <option value={5.0}>5.0 (Qua môn)</option>
                      <option value={7.0}>7.0 (Khá)</option>
                      <option value={8.0}>8.0 (Giỏi)</option>
                      <option value={9.0}>9.0 (Xuất sắc)</option>
                    </select>
                  </div>
                </div>

                {feServerRes && (
                  <div className="p-3 rounded-xl bg-[#f37021]/12 border border-[#f37021]/35 flex items-center justify-between">
                    <div className="text-xs">
                      <div className="opacity-80">Điểm FE tối thiểu cần đạt:</div>
                      <div className="text-[11px] text-[#f37021] font-semibold mt-0.5">
                        {feServerRes.verdict}
                      </div>
                    </div>
                    <div className="text-2xl font-extrabold font-mono text-[#f37021]">
                      {feServerRes.required_fe}
                    </div>
                  </div>
                )}
              </div>

              {/* What-If Semester GPA Simulator */}
              <div className={`p-4 rounded-2xl border space-y-3 ${cardCls}`}>
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-sky-400" />
                    <span>Giả lập GPA Học kỳ (What-If Simulation)</span>
                  </h3>
                  <button
                    onClick={handleRunSimulation}
                    className="px-3 py-1 rounded-xl text-[11px] font-bold bg-sky-500 text-white cursor-pointer"
                  >
                    Tính GPA mới
                  </button>
                </div>

                {Object.keys(simGrades).length === 0 ? (
                  <div className="text-xs opacity-65">Chưa có môn đang học (Studying) trong kỳ.</div>
                ) : (
                  <div className="space-y-2.5">
                    {Object.entries(simGrades).map(([code, val]) => (
                      <div key={code} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-mono font-bold">{code}</span>
                          <span className="font-mono font-extrabold text-sky-400">{Number(val).toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="4.0"
                          max="10.0"
                          step="0.1"
                          value={val}
                          onChange={(e) =>
                            setSimGrades((prev) => ({ ...prev, [code]: parseFloat(e.target.value) }))
                          }
                          className="w-full accent-[#f37021]"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {simResult && (
                  <div className="p-3 rounded-xl bg-emerald-500/12 border border-emerald-500/35 text-xs space-y-1">
                    <div>
                      GPA Kỳ dự kiến: <b className="font-mono">{simResult.semester_gpa_projected}</b>
                    </div>
                    <div>
                      GPA Tích lũy mới:{" "}
                      <b className="font-mono text-emerald-400 text-sm">{simResult.cumulative_gpa_after}</b> (
                      {simResult.gpa_delta >= 0 ? `+${simResult.gpa_delta}` : simResult.gpa_delta} so với{" "}
                      {simResult.cumulative_gpa_before})
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ACCOUNT, CHANGE PASSWORD, OTP RESET & SERVER SETTINGS */}
          {activeTab === "account" && (
            <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
              {/* Profile & Switch Account */}
              <div className={`p-4 rounded-2xl border space-y-3 ${cardCls}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-sm">{displayName}</div>
                    <div className="text-xs opacity-75 font-mono">
                      {displaySid} · {student?.email || snapshot?.email || ""}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setAuthIdentifier(displaySid !== "FAP" ? displaySid : "");
                      setAuthMode("login");
                      setRequiresAuthModal(true);
                    }}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-500/15 hover:bg-rose-500/20 hover:text-rose-400 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{student ? "Đổi TK / Reset OTP" : "Đăng nhập"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10.5px] opacity-70 block mb-1">Cơ sở tính học phí</label>
                    <select
                      value={student?.campus || snapshot?.campus || "Hà Nội"}
                      onChange={async (e) => {
                        const cp = e.target.value;
                        if (getExtToken()) {
                          const r = await extApiRequest("/api/auth/campus", {
                            method: "PUT",
                            body: JSON.stringify({ campus: cp }),
                          }).catch(() => null);
                          if (r?.token) {
                            setExtToken(r.token);
                            await loadAuthenticatedBundle();
                          }
                        }
                      }}
                      className={`w-full px-2.5 py-1.5 rounded-xl border text-xs ${
                        dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                      }`}
                    >
                      {campuses.map((c) => (
                        <option key={c} value={c}>
                          FPTU {c}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10.5px] opacity-70 block mb-1">Máy chủ AI Backend</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={serverUrlInput}
                        onChange={(e) => setServerUrlInput(e.target.value)}
                        className={`w-full px-2 py-1.5 rounded-xl border text-[11px] font-mono ${
                          dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setServerUrl(serverUrlInput);
                          loadAuthenticatedBundle();
                        }}
                        className="px-2 rounded-xl bg-[#f37021] text-white text-[10.5px] font-bold cursor-pointer"
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Change Password Form */}
              <form onSubmit={handleChangePassword} className={`p-4 rounded-2xl border space-y-2.5 ${cardCls}`}>
                <h3 className="text-xs font-extrabold flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-[#f37021]" />
                  <span>Đổi mật khẩu bảo mật (Mã hóa bcrypt)</span>
                </h3>

                {pwdMsg && (
                  <div
                    className={`p-2.5 rounded-xl text-xs border ${
                      pwdMsg.tone === "success"
                        ? "bg-emerald-500/12 border-emerald-500/35 text-emerald-400"
                        : "bg-rose-500/12 border-rose-500/35 text-rose-400"
                    }`}
                  >
                    {pwdMsg.text}
                  </div>
                )}

                <input
                  type="password"
                  required
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="Mật khẩu hiện tại (mặc định: 123456)"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                  }`}
                />
                <input
                  type="password"
                  required
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Mật khẩu mới (>= 6 ký tự, gồm chữ & số)"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                  }`}
                />
                <div className="grid grid-cols-4 gap-1">
                  {[1, 2, 3, 4].map((lv) => (
                    <div
                      key={lv}
                      className={`h-1 rounded-full ${
                        newPwdStrength.score >= lv ? newPwdStrength.barColor : "bg-slate-700/40"
                      }`}
                    />
                  ))}
                </div>
                <input
                  type="password"
                  required
                  value={confirmNewPwd}
                  onChange={(e) => setConfirmNewPwd(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    dark ? "bg-slate-950 border-slate-800" : "bg-slate-50 border-slate-300"
                  }`}
                />
                <button
                  type="submit"
                  disabled={pwdBusy || !student}
                  className="w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-[#f37021] to-orange-500 text-white disabled:opacity-50 cursor-pointer"
                >
                  {pwdBusy ? "Đang cập nhật..." : "Lưu mật khẩu mới"}
                </button>
              </form>

              {/* Recent Auth & FAP Sync Logs */}
              {authLogs.length > 0 && (
                <div className={`p-4 rounded-2xl border space-y-2 ${cardCls}`}>
                  <h3 className="text-xs font-extrabold">Nhật ký Đồng bộ FAP & Bảo mật gần đây</h3>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto text-[11px]">
                    {authLogs.slice(0, 6).map((l, idx) => (
                      <div
                        key={idx}
                        className="p-2 rounded-xl border border-slate-500/15 flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="font-mono font-bold text-[#f37021] mr-1.5">{l.event_type}</span>
                          <span className="opacity-80">{l.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
