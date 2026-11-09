import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Sun,
  Moon,
  UserCheck,
  Zap,
} from "lucide-react";
import { apiRequest } from "../lib/api";
import { FptEmblem, PasswordStrengthMeter, UniFsWordmark } from "./BrandMark";

export default function AuthPortal({
  dark,
  onToggleTheme,
  campuses = ["Hà Nội", "TP.HCM", "Đà Nẵng", "Bình Định", "Cần Thơ"],
  onLoginSuccess,
  pushToast,
}) {
  const [mode, setMode] = useState("login"); // "login" | "forgot"

  // Login Form State
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [campus, setCampus] = useState(campuses[0] || "Hà Nội");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Demo Accounts Drawer
  const [demoAccounts, setDemoAccounts] = useState([]);
  const [showDemo, setShowDemo] = useState(true);

  // Forgot / Reset Password 3-Step Wizard State
  const [step, setStep] = useState(1); // 1: Request OTP, 2: Verify 6-digit OTP, 3: New Password, 4: Done
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [otpMeta, setOtpMeta] = useState(null); // { student_id, full_name, masked_email, delivery_mode, demo_otp, expires_in }
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [countdown, setCountdown] = useState(0);
  const [resetToken, setResetToken] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const otpRefs = useRef([]);

  useEffect(() => {
    apiRequest("/api/auth/demo-accounts")
      .then((res) => setDemoAccounts(res.accounts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const formatTimer = (sec) => {
    const m = String(Math.floor(sec / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleLogin = async (e, overrideId, overridePwd) => {
    if (e) e.preventDefault();
    const idVal = (overrideId !== undefined ? overrideId : identifier).trim();
    const pwVal = (overridePwd !== undefined ? overridePwd : password).trim();
    if (!idVal || !pwVal) {
      setErrorMsg("Vui lòng nhập đầy đủ MSSV/Email FPT và mật khẩu.");
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          identifier: idVal,
          password: pwVal,
          campus,
          remember_me: rememberMe,
        }),
      });
      pushToast(res.message || "Đăng nhập thành công!", "success");
      onLoginSuccess(res.token, res.student);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const openForgotWizard = (prefillId = "") => {
    setMode("forgot");
    setStep(1);
    setErrorMsg("");
    setResetIdentifier(prefillId || identifier || "");
    setOtpMeta(null);
    setOtpDigits(["", "", "", "", "", ""]);
    setResetToken("");
    setNewPwd("");
    setConfirmPwd("");
  };

  // Step 1: Request OTP
  const handleRequestOtp = async (e) => {
    if (e) e.preventDefault();
    if (!resetIdentifier.trim()) {
      setErrorMsg("Vui lòng nhập Mã số sinh viên (MSSV) hoặc Email FPT.");
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ identifier: resetIdentifier.trim() }),
      });
      setOtpMeta(res);
      setOtpDigits(["", "", "", "", "", ""]);
      setCountdown(res.expires_in || 300);
      setStep(2);
      pushToast(
        res.delivery_mode === "smtp"
          ? `Đã gửi mã OTP 6 số tới ${res.masked_email}`
          : `Đã tạo mã OTP xác thực cho ${res.student_id}`,
        "success"
      );
      setTimeout(() => otpRefs.current[0]?.focus(), 120);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (idx, val) => {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      const next = [...otpDigits];
      next[idx] = "";
      setOtpDigits(next);
      return;
    }
    // Hỗ trợ dán nguyên chuỗi 6 chữ số
    if (clean.length > 1) {
      const arr = clean.slice(0, 6).split("");
      const next = ["", "", "", "", "", ""];
      arr.forEach((d, i) => (next[i] = d));
      setOtpDigits(next);
      const focusIdx = Math.min(arr.length, 5);
      otpRefs.current[focusIdx]?.focus();
      return;
    }
    const next = [...otpDigits];
    next[idx] = clean;
    setOtpDigits(next);
    if (idx < 5) {
      otpRefs.current[idx + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !otpDigits[idx] && idx > 0) {
      otpRefs.current[idx - 1]?.focus();
    }
  };

  const autofillDemoOtp = () => {
    if (!otpMeta?.demo_otp) return;
    const arr = String(otpMeta.demo_otp).slice(0, 6).split("");
    setOtpDigits(arr);
    setErrorMsg("");
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    const code = otpDigits.join("");
    if (code.length !== 6) {
      setErrorMsg("Vui lòng nhập đủ 6 chữ số OTP.");
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: JSON.stringify({
          identifier: otpMeta?.student_id || resetIdentifier.trim(),
          otp_code: code,
        }),
      });
      setResetToken(res.reset_token);
      setStep(3);
      pushToast("Xác thực OTP thành công! Hãy đặt mật khẩu mới.", "success");
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Save New Password
  const handleResetPassword = async (e) => {
    if (e) e.preventDefault();
    if (newPwd.trim().length < 6) {
      setErrorMsg("Mật khẩu mới phải có ít nhất 6 ký tự.");
      return;
    }
    if (newPwd.trim() !== confirmPwd.trim()) {
      setErrorMsg("Mật khẩu xác nhận không trùng khớp.");
      return;
    }
    setErrorMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          reset_token: resetToken,
          new_password: newPwd.trim(),
          confirm_password: confirmPwd.trim(),
        }),
      });
      pushToast(res.message || "Đặt lại mật khẩu thành công!", "success");
      setStep(4);
      // Reload demo accounts so custom_password badge updates accurately
      apiRequest("/api/auth/demo-accounts")
        .then((r) => setDemoAccounts(r.accounts || []))
        .catch(() => {});
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cardSurface = dark
    ? "bg-slate-900/80 border-slate-800/90 text-slate-100 shadow-2xl shadow-black/50"
    : "bg-white/90 border-slate-200/90 text-slate-900 shadow-2xl shadow-slate-300/50";

  const inputCls = dark
    ? "bg-slate-950/80 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
    : "bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-sky-600 focus:ring-2 focus:ring-sky-500/15";

  const badgeToneMap = {
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    danger: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    info: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  };

  return (
    <div
      className={`min-h-screen relative overflow-hidden flex flex-col justify-between transition-colors duration-300 ${
        dark ? "bg-[#060b18] text-slate-100" : "bg-slate-50 text-slate-900"
      }`}
    >
      {/* Ambient FPT Tricolor Aurora Glows */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-36 -left-32 w-[480px] h-[480px] rounded-full bg-[#0066b2]/22 blur-[125px] animate-glow" />
        <div className="absolute top-1/3 -right-32 w-[440px] h-[440px] rounded-full bg-[#f37021]/16 blur-[130px] animate-glow" />
        <div className="absolute -bottom-40 left-1/3 w-[460px] h-[460px] rounded-full bg-[#0db14b]/15 blur-[130px] animate-glow" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 pt-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FptEmblem size="md" />
          <span className="font-display font-bold text-sm sm:text-base tracking-tight">
            FPT University · Academic AI Portal
          </span>
        </div>
        <button
          onClick={onToggleTheme}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-semibold transition ${
            dark
              ? "bg-slate-900/80 border-slate-800 text-slate-200 hover:bg-slate-800"
              : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
          }`}
        >
          {dark ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-sky-600" />}
          <span>{dark ? "Giao diện Sáng" : "Giao diện Tối"}</span>
        </button>
      </header>

      {/* Main Split Grid */}
      <main className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center my-auto">
        {/* LEFT HERO PANEL */}
        <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Nền tảng Cố vấn Học vụ Thông minh Thế hệ Mới 2026</span>
          </div>

          <div className="flex flex-col lg:flex-row items-center gap-6">
            <div className="relative shrink-0">
              <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#0066b2] via-[#f37021] to-[#0db14b] blur-2xl opacity-35" />
              <img
                src="/assets/mascot_hero_clean.png"
                alt="UniFs Mascot"
                className="relative w-36 h-36 sm:w-44 sm:h-44 object-contain animate-float drop-shadow-2xl"
              />
            </div>
            <div className="space-y-2.5">
              <UniFsWordmark size="xl" dark={dark} />
              <h1 className="text-xl sm:text-2xl font-bold leading-snug">
                Trợ lý AI Học vụ & Dashboard 360° cho sinh viên{" "}
                <span className="bg-gradient-to-r from-[#0066b2] via-[#f37021] to-[#0db14b] bg-clip-text text-transparent">
                  FPT University
                </span>
              </h1>
              <p className={`text-sm leading-relaxed max-w-xl ${dark ? "text-slate-400" : "text-slate-600"}`}>
                Tích hợp Hybrid RAG tra cứu quy chế chính xác, dự báo tốt nghiệp bằng Hồi quy xu hướng, tính điểm sàn Final Exam (FE), cảnh báo cấm thi AF và đồng bộ trực tiếp từ FAP.
              </p>
            </div>
          </div>

          {/* 3 Feature Bento Pills */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2 text-left">
            {[
              {
                icon: "📊",
                title: "Dashboard Học vụ 360°",
                desc: "Biểu đồ GPA từng kỳ, theo dõi 20 slot điểm danh & cảnh báo đỏ AF 20%.",
                border: "hover:border-[#0066b2]/60",
              },
              {
                icon: "🧮",
                title: "Giả lập GPA & Điểm FE",
                desc: "Thanh trượt What-If tính ngay GPA kỳ dự kiến & điểm thi FE cần đạt.",
                border: "hover:border-[#f37021]/60",
              },
              {
                icon: "🛡️",
                title: "Bảo mật Bcrypt & OTP",
                desc: "Mã hóa mật khẩu có muối, đổi mật khẩu trực tiếp & khôi phục bằng OTP 6 số.",
                border: "hover:border-[#0db14b]/60",
              },
            ].map((f, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-2xl border backdrop-blur-md transition duration-200 ${f.border} ${
                  dark
                    ? "bg-slate-900/60 border-slate-800/80"
                    : "bg-white/80 border-slate-200/80 shadow-sm"
                }`}
              >
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="font-bold text-sm mb-1">{f.title}</div>
                <div className={`text-xs leading-relaxed ${dark ? "text-slate-400" : "text-slate-500"}`}>
                  {f.desc}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT AUTHENTICATION CARD */}
        <div className="lg:col-span-6 w-full max-w-lg mx-auto">
          <div className={`rounded-3xl border backdrop-blur-2xl p-6 sm:p-8 transition-all ${cardSurface}`}>
            {/* Top Mode Tabs */}
            <div
              className={`grid grid-cols-2 p-1 rounded-2xl mb-6 ${
                dark ? "bg-slate-950/90 border border-slate-800" : "bg-slate-100 border border-slate-200"
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrorMsg("");
                }}
                className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  mode === "login"
                    ? "bg-gradient-to-r from-[#0066b2] to-[#0284c7] text-white shadow-md shadow-sky-500/25"
                    : dark
                    ? "text-slate-400 hover:text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <UserCheck className="w-4 h-4" />
                <span>Đăng nhập</span>
              </button>
              <button
                type="button"
                onClick={() => openForgotWizard(identifier)}
                className={`py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 ${
                  mode === "forgot"
                    ? "bg-gradient-to-r from-[#f37021] to-amber-500 text-white shadow-md shadow-orange-500/25"
                    : dark
                    ? "text-slate-400 hover:text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Reset mật khẩu OTP</span>
              </button>
            </div>

            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-2xl border border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs sm:text-sm font-medium flex items-start gap-2.5 animate-fade-up">
                <span className="text-base leading-none">⚠️</span>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* ===================== MODE 1: LOGIN ===================== */}
            {mode === "login" && (
              <div className="animate-fade-up">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                      Mã số sinh viên (MSSV) hoặc Email FPT
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={identifier}
                        onChange={(e) => setIdentifier(e.target.value)}
                        placeholder="VD: SE190457 hoặc hoanglmse190457@fpt.edu.vn"
                        className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition ${inputCls}`}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider opacity-80">
                        Mật khẩu
                      </label>
                      <button
                        type="button"
                        onClick={() => openForgotWizard(identifier)}
                        className="text-xs font-semibold text-[#f37021] hover:underline"
                      >
                        Quên mật khẩu?
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type={showPwd ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Nhập mật khẩu (mặc định: 123456)"
                        className={`w-full pl-10 pr-11 py-3 rounded-xl border text-sm outline-none transition ${inputCls}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-400 p-1"
                        title={showPwd ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                      >
                        {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center pt-0.5">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider mb-1 opacity-75">
                        Cơ sở đào tạo
                      </label>
                      <div className="relative">
                        <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                          value={campus}
                          onChange={(e) => setCampus(e.target.value)}
                          className={`w-full pl-8 pr-3 py-2.5 rounded-xl border text-xs font-medium outline-none transition ${inputCls}`}
                        >
                          {campuses.map((c) => (
                            <option key={c} value={c} className="bg-slate-900 text-white">
                              FPTU {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="flex items-center gap-2.5 cursor-pointer select-none pt-4 sm:pt-5">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="w-4 h-4 rounded accent-[#0066b2]"
                      />
                      <span className={`text-xs font-medium ${dark ? "text-slate-300" : "text-slate-600"}`}>
                        Ghi nhớ đăng nhập 30 ngày
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#0066b2] via-[#0284c7] to-[#0db14b] hover:brightness-110 active:scale-[0.99] transition shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                  >
                    {loading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Truy cập Không gian Học vụ UniFs</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Quick Demo Personas Drawer */}
                <div className="mt-6 pt-5 border-t border-slate-500/20">
                  <button
                    type="button"
                    onClick={() => setShowDemo((v) => !v)}
                    className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-sky-400 hover:text-sky-300 transition cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#f37021]" />
                      Tài khoản Demo Kiểm thử Nhanh (1-Click)
                    </span>
                    {showDemo ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showDemo && (
                    <div className="mt-3 space-y-2 max-h-56 overflow-y-auto pr-1">
                      {demoAccounts.map((acc) => (
                        <div
                          key={acc.student_id}
                          className={`p-2.5 rounded-xl border transition flex items-center justify-between gap-2 ${
                            dark
                              ? "bg-slate-950/70 border-slate-800/90 hover:border-sky-500/50"
                              : "bg-slate-50 border-slate-200 hover:border-sky-400"
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-xs text-sky-400">
                                {acc.student_id}
                              </span>
                              <span className="font-semibold text-xs truncate">{acc.full_name}</span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                  badgeToneMap[acc.badge_tone] || badgeToneMap.info
                                }`}
                              >
                                {acc.badge}
                              </span>
                            </div>
                            <div className={`text-[11px] mt-0.5 truncate ${dark ? "text-slate-400" : "text-slate-500"}`}>
                              {acc.scenario}
                            </div>
                          </div>

                          {acc.has_custom_password ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setIdentifier(acc.student_id);
                                  setPassword("");
                                  setErrorMsg(`Tài khoản ${acc.student_id} đã được đổi mật khẩu riêng. Nhập mật khẩu của bạn hoặc bấm 'Reset mật khẩu OTP'!`);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-800 text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                              >
                                Chọn
                              </button>
                              <button
                                type="button"
                                onClick={() => openForgotWizard(acc.student_id)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30 hover:bg-orange-500/30 transition cursor-pointer"
                                title="Khôi phục mật khẩu bằng OTP"
                              >
                                Reset OTP
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setIdentifier(acc.student_id);
                                setPassword("123456");
                                handleLogin(null, acc.student_id, "123456");
                              }}
                              className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30 hover:bg-sky-500 hover:text-white transition cursor-pointer"
                            >
                              Vào ngay →
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ===================== MODE 2: 3-STEP OTP PASSWORD RESET ===================== */}
            {mode === "forgot" && (
              <div className="animate-fade-up space-y-5">
                {/* Stepper Progress */}
                <div className="flex items-center justify-between px-1">
                  {[
                    { n: 1, label: "Tài khoản" },
                    { n: 2, label: "Mã OTP 6 số" },
                    { n: 3, label: "Mật khẩu mới" },
                  ].map((s, idx) => {
                    const active = step >= s.n;
                    return (
                      <React.Fragment key={s.n}>
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-extrabold transition ${
                              active
                                ? "bg-gradient-to-r from-[#f37021] to-amber-500 text-white shadow-md shadow-orange-500/30"
                                : dark
                                ? "bg-slate-800 text-slate-500"
                                : "bg-slate-200 text-slate-500"
                            }`}
                          >
                            {step > s.n ? "✓" : s.n}
                          </div>
                          <span
                            className={`text-xs font-semibold ${
                              active ? "" : "opacity-50"
                            }`}
                          >
                            {s.label}
                          </span>
                        </div>
                        {idx < 2 && (
                          <div
                            className={`flex-1 h-0.5 mx-2 rounded ${
                              step > s.n
                                ? "bg-[#f37021]"
                                : dark
                                ? "bg-slate-800"
                                : "bg-slate-200"
                            }`}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* STEP 1: ENTER MSSV OR EMAIL */}
                {step === 1 && (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <div className={`text-xs leading-relaxed ${dark ? "text-slate-400" : "text-slate-600"}`}>
                      Nhập <b>Mã số sinh viên (MSSV)</b> hoặc <b>Email FPT</b> của bạn. Hệ thống sẽ phát hành mã xác thực OTP gồm 6 chữ số (hiệu lực 5 phút) để đặt lại mật khẩu.
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                        MSSV hoặc Email FPT cần khôi phục
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={resetIdentifier}
                          onChange={(e) => setResetIdentifier(e.target.value)}
                          placeholder="Ví dụ: SE190456 hoặc se190456@fpt.edu.vn"
                          className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition ${inputCls}`}
                          autoFocus
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#f37021] to-amber-500 hover:brightness-110 transition shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <span>Gửi mã xác thực OTP 6 số</span>
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* STEP 2: ENTER 6-DIGIT OTP */}
                {step === 2 && otpMeta && (
                  <form onSubmit={handleVerifyOtp} className="space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className={dark ? "text-slate-300" : "text-slate-700"}>
                        Sinh viên: <b>{otpMeta.full_name}</b> (<code className="text-sky-400">{otpMeta.student_id}</code>)
                      </span>
                      <span
                        className={`font-mono font-bold px-2.5 py-1 rounded-full ${
                          countdown > 60
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-rose-500/15 text-rose-400"
                        }`}
                      >
                        ⏱ {formatTimer(countdown)}
                      </span>
                    </div>

                    {/* Demo Mode Simulated Inbox Card */}
                    {otpMeta.delivery_mode === "demo" && otpMeta.demo_otp && (
                      <div className="p-3.5 rounded-2xl border border-amber-500/40 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-transparent space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                            <span>📨</span> Hộp thư OTP Trực quan (Demo Bảo vệ Đồ án)
                          </span>
                          <span className="text-[11px] opacity-75 font-mono">{otpMeta.masked_email}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 pt-1">
                          <div>
                            <div className="text-[11px] opacity-75">Mã xác thực 6 số của bạn:</div>
                            <div className="font-mono text-2xl font-extrabold tracking-[0.28em] text-amber-300">
                              {otpMeta.demo_otp}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={autofillDemoOtp}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-500 text-slate-950 hover:bg-amber-400 transition shrink-0 shadow cursor-pointer"
                          >
                            ⚡ Tự động điền OTP
                          </button>
                        </div>
                      </div>
                    )}

                    {otpMeta.delivery_mode === "smtp" && (
                      <div className="p-3 rounded-xl border border-sky-500/30 bg-sky-500/10 text-xs text-sky-300">
                        Mã OTP gồm 6 chữ số đã được gửi tới email <b>{otpMeta.masked_email}</b>. Vui lòng kiểm tra hộp thư đến hoặc thư rác.
                      </div>
                    )}

                    {/* 6 Interactive PIN Boxes */}
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-2 text-center opacity-80">
                        Nhập 6 chữ số OTP
                      </label>
                      <div className="grid grid-cols-6 gap-2 sm:gap-2.5 max-w-xs mx-auto">
                        {otpDigits.map((digit, idx) => (
                          <input
                            key={idx}
                            ref={(el) => (otpRefs.current[idx] = el)}
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={digit}
                            onChange={(e) => handleOtpChange(idx, e.target.value)}
                            onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                            className={`h-12 sm:h-14 text-center font-mono text-xl font-extrabold rounded-xl border outline-none transition ${inputCls}`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={handleRequestOtp}
                        disabled={loading}
                        className={`px-4 py-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                          dark
                            ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                            : "border-slate-300 hover:bg-slate-100 text-slate-700"
                        }`}
                      >
                        Gửi lại mã
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex-1 py-3 px-5 rounded-xl font-bold text-sm text-white bg-gradient-to-r from-[#f37021] to-amber-500 hover:brightness-110 transition shadow-lg shadow-orange-500/25 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {loading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <ShieldCheck className="w-4 h-4" />
                            <span>Xác nhận OTP</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* STEP 3: SET NEW PASSWORD */}
                {step === 3 && (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                        Mật khẩu mới
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type={showNewPwd ? "text" : "password"}
                          value={newPwd}
                          onChange={(e) => setNewPwd(e.target.value)}
                          placeholder="Nhập mật khẩu mới (>= 6 ký tự)"
                          className={`w-full pl-10 pr-11 py-3 rounded-xl border text-sm outline-none transition ${inputCls}`}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPwd((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-400 p-1"
                        >
                          {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <PasswordStrengthMeter password={newPwd} dark={dark} />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 opacity-80">
                        Xác nhận mật khẩu mới
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type={showNewPwd ? "text" : "password"}
                          value={confirmPwd}
                          onChange={(e) => setConfirmPwd(e.target.value)}
                          placeholder="Nhập lại chính xác mật khẩu mới"
                          className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm outline-none transition ${inputCls}`}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#0db14b] to-emerald-600 hover:brightness-110 transition shadow-lg shadow-emerald-500/25 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {loading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Lưu mật khẩu mới (Mã hóa Bcrypt)</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* STEP 4: SUCCESS */}
                {step === 4 && (
                  <div className="text-center py-4 space-y-4 animate-fade-up">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="w-9 h-9" />
                    </div>
                    <div>
                      <h3 className="text-lg font-extrabold">Khôi phục mật khẩu hoàn tất!</h3>
                      <p className={`text-xs mt-1 ${dark ? "text-slate-400" : "text-slate-600"}`}>
                        Mật khẩu mới của tài khoản <b className="text-sky-400">{otpMeta?.student_id}</b> đã được băm an toàn bằng chuẩn <code>bcrypt</code>.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const sid = otpMeta?.student_id || resetIdentifier;
                        setIdentifier(sid);
                        setPassword(newPwd);
                        setMode("login");
                        setErrorMsg("");
                      }}
                      className="w-full py-3.5 px-5 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#0066b2] to-[#0db14b] hover:brightness-110 transition shadow-lg cursor-pointer"
                    >
                      🚀 Quay lại Đăng nhập ngay
                    </button>
                  </div>
                )}

                {step < 4 && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode("login");
                      setErrorMsg("");
                    }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-sky-400 transition cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Quay về màn hình Đăng nhập</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-7xl mx-auto px-5 sm:px-8 pb-5 text-center sm:flex sm:items-center sm:justify-between text-xs opacity-65">
        <div>© 2026 UniFs Pro · Hệ thống Cố vấn Học vụ Thông minh Đại học FPT</div>
        <div className="mt-1 sm:mt-0 font-mono">Hybrid RAG · Gemini Function Calling · FAP Auto-Sync</div>
      </footer>
    </div>
  );
}
