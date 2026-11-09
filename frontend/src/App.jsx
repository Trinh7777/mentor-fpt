import React, { useCallback, useEffect, useState } from "react";
import {
  Calculator,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  RefreshCw,
  Shield,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import AuthPortal from "./components/AuthPortal";
import { FptEmblem, ToastContainer, UniFsWordmark } from "./components/BrandMark";
import ChatStudio from "./components/ChatStudio";
import Dashboard360 from "./components/Dashboard360";
import RoadmapView from "./components/RoadmapView";
import SecurityModal from "./components/SecurityModal";
import ToolsHub from "./components/ToolsHub";
import {
  apiRequest,
  getStoredTheme,
  getStoredToken,
  setStoredTheme,
  setStoredToken,
  streamChatMessage,
} from "./lib/api";

export default function App() {
  const [dark, setDark] = useState(() => getStoredTheme() !== "light");
  const [booting, setBooting] = useState(true);
  const [health, setHealth] = useState(null);

  // Auth & Student Data
  const [student, setStudent] = useState(null);
  const [campus, setCampus] = useState("Hà Nội");
  const [overview, setOverview] = useState(null);
  const [roadmap, setRoadmap] = useState(null);

  // Workspace UI Navigation
  const [activeView, setActiveView] = useState("chat"); // "chat" | "dashboard" | "roadmap" | "tools"
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [securityModal, setSecurityModal] = useState({ open: false, tab: "password" });

  // Multi-Thread Chat State
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((message, type = "success") => {
    const id = `${Date.now()}_${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toggleTheme = () => {
    setDark((prev) => {
      const next = !prev;
      setStoredTheme(next ? "dark" : "light");
      return next;
    });
  };

  const loadAcademicWorkspace = useCallback(async () => {
    const [ov, rm, thRes] = await Promise.all([
      apiRequest("/api/dashboard/overview"),
      apiRequest("/api/dashboard/roadmap"),
      apiRequest("/api/chat/threads"),
    ]);
    setOverview(ov);
    setRoadmap(rm);
    const list = thRes.threads || [];
    setThreads(list);
    if (list.length > 0) {
      const firstId = list[0].thread_id;
      setActiveThreadId(firstId);
      const detail = await apiRequest(`/api/chat/threads/${firstId}`);
      setMessages(detail.messages || []);
    } else {
      setActiveThreadId(null);
      setMessages([]);
    }
  }, []);

  // Initial Boot Check
  useEffect(() => {
    apiRequest("/api/health")
      .then(setHealth)
      .catch(() => {});

    const tok = getStoredToken();
    if (!tok) {
      setBooting(false);
      return;
    }

    apiRequest("/api/auth/me")
      .then(async (me) => {
        setStudent(me.student);
        setCampus(me.campus || "Hà Nội");
        await loadAcademicWorkspace();
      })
      .catch(() => {
        setStoredToken("");
        setStudent(null);
      })
      .finally(() => setBooting(false));
  }, [loadAcademicWorkspace]);

  const handleLoginSuccess = async (token, stInfo) => {
    setStoredToken(token);
    setStudent(stInfo);
    setCampus(stInfo?.campus || "Hà Nội");
    setActiveView("chat");
    try {
      await loadAcademicWorkspace();
    } catch (err) {
      pushToast(err.message, "error");
    }
  };

  const handleLogout = () => {
    setStoredToken("");
    setStudent(null);
    setOverview(null);
    setRoadmap(null);
    setThreads([]);
    setMessages([]);
    setActiveThreadId(null);
    pushToast("Đã đăng xuất an toàn.", "info");
  };

  const handleRefreshFap = async () => {
    try {
      await apiRequest("/api/fap/refresh", { method: "POST" });
      const [ov, rm] = await Promise.all([
        apiRequest("/api/dashboard/overview"),
        apiRequest("/api/dashboard/roadmap"),
      ]);
      setOverview(ov);
      setRoadmap(rm);
      pushToast("Đã đồng bộ dữ liệu học vụ mới nhất từ SQL Database!", "success");
    } catch (err) {
      pushToast(err.message, "error");
    }
  };

  const handleCampusUpdated = async (newCampus, newToken, updatedStudent) => {
    if (newToken) setStoredToken(newToken);
    setCampus(newCampus);
    if (updatedStudent) setStudent(updatedStudent);
    try {
      const ov = await apiRequest("/api/dashboard/overview");
      setOverview(ov);
    } catch {
      // ignore
    }
  };

  // Thread Operations
  const handleNewChat = () => {
    if (isStreaming) return;
    setActiveThreadId(null);
    setMessages([]);
    setActiveView("chat");
    setMobileMenuOpen(false);
  };

  const handleSelectThread = async (tid) => {
    if (isStreaming) return;
    setActiveView("chat");
    setMobileMenuOpen(false);
    setActiveThreadId(tid);
    try {
      const detail = await apiRequest(`/api/chat/threads/${tid}`);
      setMessages(detail.messages || []);
    } catch (err) {
      pushToast(err.message, "error");
    }
  };

  const handleDeleteThread = async (e, tid) => {
    e.stopPropagation();
    try {
      await apiRequest(`/api/chat/threads/${tid}`, { method: "DELETE" });
      const nextList = threads.filter((t) => t.thread_id !== tid);
      setThreads(nextList);
      if (activeThreadId === tid) {
        setActiveThreadId(null);
        setMessages([]);
      }
      pushToast("Đã xóa cuộc trò chuyện.", "info");
    } catch (err) {
      pushToast(err.message, "error");
    }
  };

  const handleSendPrompt = async (promptText) => {
    const clean = (promptText || "").trim();
    if (!clean || isStreaming) return;

    setActiveView("chat");
    setIsStreaming(true);

    // Append user message + placeholder assistant message
    setMessages((prev) => [
      ...prev,
      { role: "user", content: clean },
      { role: "assistant", content: "", tools: [] },
    ]);

    try {
      await streamChatMessage({
        prompt: clean,
        threadId: activeThreadId,
        onMeta: (meta) => {
          setActiveThreadId(meta.thread_id);
        },
        onToken: (chunk) => {
          setMessages((prev) => {
            const copy = [...prev];
            const lastIdx = copy.length - 1;
            if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
              copy[lastIdx] = {
                ...copy[lastIdx],
                content: (copy[lastIdx].content || "") + chunk,
              };
            }
            return copy;
          });
        },
        onTools: (toolsUsed) => {
          setMessages((prev) => {
            const copy = [...prev];
            const lastIdx = copy.length - 1;
            if (lastIdx >= 0 && copy[lastIdx].role === "assistant") {
              copy[lastIdx] = { ...copy[lastIdx], tools: toolsUsed };
            }
            return copy;
          });
        },
        onDone: async () => {
          try {
            const thRes = await apiRequest("/api/chat/threads");
            setThreads(thRes.threads || []);
          } catch {
            // ignore
          }
        },
      });
    } catch (err) {
      pushToast(err.message, "error");
      setMessages((prev) => {
        const copy = [...prev];
        const lastIdx = copy.length - 1;
        if (lastIdx >= 0 && copy[lastIdx].role === "assistant" && !copy[lastIdx].content) {
          copy[lastIdx] = {
            ...copy[lastIdx],
            content: `⚠️ Không thể phản hồi lúc này: ${err.message}`,
          };
        }
        return copy;
      });
    } finally {
      setIsStreaming(false);
    }
  };

  const handleAskAiFromDashboard = (promptText) => {
    setActiveThreadId(null);
    setMessages([]);
    setActiveView("chat");
    setTimeout(() => {
      handleSendPrompt(promptText);
    }, 60);
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#060b18] text-white flex flex-col items-center justify-center gap-4">
        <img
          src="/assets/mascot_avatar_clean.png"
          alt="UniFs"
          className="w-20 h-20 rounded-full animate-bounce"
        />
        <div className="font-display font-bold text-lg">Đang khởi tạo Không gian Học vụ UniFs Pro...</div>
      </div>
    );
  }

  if (!student) {
    return (
      <>
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        <AuthPortal
          dark={dark}
          onToggleTheme={toggleTheme}
          campuses={health?.campuses || ["Hà Nội", "TP.HCM", "Đà Nẵng", "Bình Định", "Cần Thơ"]}
          onLoginSuccess={handleLoginSuccess}
          pushToast={pushToast}
        />
      </>
    );
  }

  const navItems = [
    { id: "chat", label: "Trợ lý AI UniFs", icon: MessageSquare, badge: "AI" },
    { id: "dashboard", label: "Dashboard Học vụ 360°", icon: LayoutDashboard, badge: "360°" },
    { id: "roadmap", label: "Cây Môn Học 9 Kỳ", icon: GitBranch },
    { id: "tools", label: "Tính Điểm FE & Giả lập", icon: Calculator },
  ];

  const gpaNum = overview?.gpa?.gpa;

  const SidebarContent = (
    <div className="flex flex-col h-full p-4 justify-between">
      <div className="space-y-5 overflow-y-auto pr-0.5">
        {/* Sidebar Brand */}
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-3">
            <img
              src="/assets/mascot_avatar_clean.png"
              alt="UniFs"
              className="w-11 h-11 rounded-2xl border-2 border-[#0066b2] bg-slate-900 object-cover shadow-md"
            />
            <div>
              <UniFsWordmark size="sm" dark={dark} />
              <div className="text-[11px] opacity-65 font-medium">
                FPT University AI Mentor
              </div>
            </div>
          </div>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 rounded-xl hover:bg-slate-500/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Primary CTA */}
        <button
          onClick={handleNewChat}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-[#0066b2] via-[#0284c7] to-[#0db14b] hover:brightness-110 transition shadow-md shadow-sky-600/20 flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cuộc trò chuyện mới</span>
        </button>

        {/* 4 Main Workspace Modules */}
        <div className="space-y-1">
          <div className="px-2 text-[10.5px] font-bold uppercase tracking-wider opacity-55 mb-1.5">
            Phân hệ chức năng
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveView(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition cursor-pointer ${
                  active
                    ? dark
                      ? "bg-sky-500/18 text-sky-300 border border-sky-500/35"
                      : "bg-sky-50 text-[#0056d2] border border-sky-200"
                    : dark
                    ? "text-slate-300 hover:bg-slate-800/70"
                    : "text-slate-700 hover:bg-slate-200/60"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </span>
                {item.badge && (
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#f37021]/20 text-[#f37021]">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Saved Chat Threads */}
        <div className="space-y-1.5 pt-1">
          <div className="px-2 text-[10.5px] font-bold uppercase tracking-wider opacity-55">
            Lịch sử tư vấn ({threads.length})
          </div>
          {threads.length === 0 ? (
            <div className="px-2 py-2 text-xs opacity-55">
              Chưa có cuộc trò chuyện nào được lưu.
            </div>
          ) : (
            <div className="space-y-1 max-h-52 overflow-y-auto pr-1">
              {threads.map((thr) => {
                const selected = activeView === "chat" && activeThreadId === thr.thread_id;
                return (
                  <div
                    key={thr.thread_id}
                    onClick={() => handleSelectThread(thr.thread_id)}
                    className={`group flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
                      selected
                        ? dark
                          ? "bg-slate-800 text-white font-semibold"
                          : "bg-white text-slate-900 font-semibold shadow-xs"
                        : dark
                        ? "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                        : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                    }`}
                  >
                    <span className="truncate flex-1">{thr.title}</span>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteThread(e, thr.thread_id)}
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-400 transition p-0.5"
                      title="Xóa hội thoại"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar Bottom Student Profile & Security Actions */}
      <div className="pt-3 border-t border-slate-500/20 space-y-2.5">
        <div
          onClick={() => setSecurityModal({ open: true, tab: "profile" })}
          className={`p-3 rounded-2xl border cursor-pointer transition ${
            dark
              ? "bg-slate-950/70 border-slate-800 hover:border-sky-500/40"
              : "bg-white border-slate-200 hover:border-sky-400 shadow-xs"
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0066b2] to-[#0db14b] text-white font-extrabold text-xs flex items-center justify-center shrink-0">
              {student.student_id.slice(-2)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-xs truncate">{student.full_name}</div>
              <div className="text-[11px] font-mono text-sky-400">
                {student.student_id} · Kỳ {student.current_semester}
              </div>
            </div>
            {gpaNum != null && (
              <span className="font-mono font-extrabold text-xs px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-400">
                {gpaNum.toFixed(2)}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            onClick={() => setSecurityModal({ open: true, tab: "password" })}
            className={`py-2 px-2 rounded-xl text-[11px] font-semibold border flex flex-col items-center gap-1 transition cursor-pointer ${
              dark
                ? "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                : "border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
            }`}
            title="Đổi mật khẩu"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#f37021]" />
            <span>Mật khẩu</span>
          </button>

          <button
            onClick={handleRefreshFap}
            className={`py-2 px-2 rounded-xl text-[11px] font-semibold border flex flex-col items-center gap-1 transition cursor-pointer ${
              dark
                ? "border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300"
                : "border-slate-200 bg-white hover:bg-slate-100 text-slate-700"
            }`}
            title="Làm mới dữ liệu FAP"
          >
            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sync FAP</span>
          </button>

          <button
            onClick={handleLogout}
            className={`py-2 px-2 rounded-xl text-[11px] font-semibold border flex flex-col items-center gap-1 transition cursor-pointer ${
              dark
                ? "border-slate-800 bg-slate-900 hover:bg-rose-500/15 hover:text-rose-400 text-slate-300"
                : "border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 text-slate-700"
            }`}
            title="Đăng xuất"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Thoát</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className={`h-screen flex overflow-hidden transition-colors duration-200 ${
        dark ? "bg-[#070c1a] text-slate-100" : "bg-[#f4f7fb] text-slate-900"
      }`}
    >
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Desktop Fixed Sidebar */}
      <aside
        className={`hidden lg:block w-72 shrink-0 border-r ${
          dark ? "bg-[#0b1326] border-slate-800/90" : "bg-slate-100/90 border-slate-200"
        }`}
      >
        {SidebarContent}
      </aside>

      {/* Mobile Drawer Sidebar */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/60 backdrop-blur-xs flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-72 h-full border-r ${
              dark ? "bg-[#0b1326] border-slate-800" : "bg-slate-100 border-slate-200"
            }`}
          >
            {SidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Command Header */}
        <header
          className={`h-15 shrink-0 px-4 sm:px-6 border-b flex items-center justify-between gap-3 ${
            dark
              ? "bg-[#070c1a]/90 border-slate-800/80 backdrop-blur-md"
              : "bg-white/90 border-slate-200 backdrop-blur-md"
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl hover:bg-slate-500/15"
            >
              <Menu className="w-5 h-5" />
            </button>
            <FptEmblem size="sm" />
            <span className="font-display font-bold text-sm sm:text-base truncate">
              {navItems.find((n) => n.id === activeView)?.label || "UniFs Pro"}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Engine Status Badge */}
            <div
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold border ${
                dark
                  ? "bg-slate-900 border-slate-800 text-emerald-400"
                  : "bg-emerald-50 border-emerald-200 text-emerald-700"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {health?.ai_mode === "gemini" ? "Gemini AI + Hybrid RAG" : "Direct Advisor"} ·{" "}
                FPTU {campus}
              </span>
            </div>

            {/* Security & Change Password Button */}
            <button
              onClick={() => setSecurityModal({ open: true, tab: "password" })}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                dark
                  ? "bg-slate-900 border-slate-800 text-slate-200 hover:border-sky-500/50"
                  : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Shield className="w-3.5 h-3.5 text-[#f37021]" />
              <span className="hidden sm:inline">Đổi mật khẩu</span>
            </button>

            {/* Light / Dark Mode Switch */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-xl border transition cursor-pointer ${
                dark
                  ? "bg-slate-900 border-slate-800 text-amber-400 hover:bg-slate-800"
                  : "bg-slate-50 border-slate-200 text-sky-600 hover:bg-slate-100"
              }`}
              title="Đổi giao diện Sáng / Tối"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Active Module Body */}
        <main className="flex-1 overflow-y-auto">
          {activeView === "chat" && (
            <ChatStudio
              dark={dark}
              student={student}
              overview={overview}
              messages={messages}
              isStreaming={isStreaming}
              onSendPrompt={handleSendPrompt}
            />
          )}
          {activeView === "dashboard" && (
            <Dashboard360
              dark={dark}
              overview={overview}
              onAskAiAbout={handleAskAiFromDashboard}
            />
          )}
          {activeView === "roadmap" && (
            <RoadmapView
              dark={dark}
              roadmapData={roadmap}
              onAskAiAbout={handleAskAiFromDashboard}
            />
          )}
          {activeView === "tools" && (
            <ToolsHub dark={dark} overview={overview} pushToast={pushToast} />
          )}
        </main>
      </div>

      {/* Account Security & Change Password Modal */}
      <SecurityModal
        open={securityModal.open}
        initialTab={securityModal.tab}
        dark={dark}
        student={student}
        campus={campus}
        campuses={health?.campuses || ["Hà Nội", "TP.HCM", "Đà Nẵng", "Bình Định", "Cần Thơ"]}
        tuitionMap={health?.tuition_per_credit || {}}
        onClose={() => setSecurityModal((s) => ({ ...s, open: false }))}
        onCampusUpdated={handleCampusUpdated}
        pushToast={pushToast}
      />
    </div>
  );
}
