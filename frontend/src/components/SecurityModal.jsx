import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  History,
  KeyRound,
  Lock,
  MapPin,
  RefreshCw,
  Shield,
  User,
  X,
} from "lucide-react";
import { apiRequest, formatVND } from "../lib/api";
import { PasswordStrengthMeter } from "./BrandMark";

const EVENT_LABELS = {
  LOGIN: { label: "Đăng nhập thành công", tone: "text-emerald-400 bg-emerald-500/15" },
  CHANGE_PASSWORD: { label: "Đổi mật khẩu chủ động", tone: "text-sky-400 bg-sky-500/15" },
  OTP_REQUEST: { label: "Yêu cầu mã OTP khôi phục", tone: "text-amber-400 bg-amber-500/15" },
  RESET_PASSWORD: { label: "Reset mật khẩu qua OTP", tone: "text-orange-400 bg-orange-500/15" },
  FAP_SYNC: { label: "Đồng bộ dữ liệu FAP", tone: "text-violet-400 bg-violet-500/15" },
};

export default function SecurityModal({
  open,
  initialTab = "password",
  dark,
  student,
  campus,
  campuses = [],
  tuitionMap = {},
  onClose,
  onCampusUpdated,
  pushToast,
}) {
  const [tab, setTab] = useState(initialTab);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [authLogs, setAuthLogs] = useState([]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!open) return;
    setErrMsg("");
    apiRequest("/api/auth/me")
      .then((res) => setAuthLogs(res.auth_logs || []))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!oldPassword.trim() || !newPassword.trim()) {
      setErrMsg("Vui lòng nhập đầy đủ mật khẩu hiện tại và mật khẩu mới.");
      return;
    }
    if (newPassword.trim().length < 6) {
      setErrMsg("Mật khẩu mới phải có tối thiểu 6 ký tự.");
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      setErrMsg("Mật khẩu xác nhận không khớp.");
      return;
    }

    setErrMsg("");
    setLoading(true);
    try {
      const res = await apiRequest("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          old_password: oldPassword.trim(),
          new_password: newPassword.trim(),
          confirm_password: confirmPassword.trim(),
        }),
      });
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setAuthLogs(res.auth_logs || authLogs);
      pushToast(res.message || "Đã đổi mật khẩu thành công!", "success");
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCampusChange = async (newCampus) => {
    try {
      const res = await apiRequest("/api/auth/campus", {
        method: "PUT",
        body: JSON.stringify({ campus: newCampus }),
      });
      onCampusUpdated(res.campus, res.token, res.student);
      pushToast(`Đã chuyển cơ sở tính học phí sang FPTU ${newCampus}`, "success");
    } catch (err) {
      pushToast(err.message, "error");
    }
  };

  const inputCls = dark
    ? "bg-slate-950 border-slate-800 text-slate-100 focus:border-sky-500"
    : "bg-slate-50 border-slate-200 text-slate-900 focus:border-sky-600";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-xl rounded-3xl border overflow-hidden shadow-2xl animate-fade-up ${
          dark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Top Accent Strip */}
        <div className="h-1.5 bg-gradient-to-r from-[#0066b2] via-[#f37021] to-[#0db14b]" />

        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base sm:text-lg">
                  Trung tâm Tài khoản & Bảo mật
                </h3>
                <p className="text-xs opacity-70">
                  {student?.full_name} · <span className="font-mono">{student?.student_id}</span>
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-500/15 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* 3 Navigation Tabs */}
          <div
            className={`grid grid-cols-3 p-1 rounded-2xl text-xs font-bold ${
              dark ? "bg-slate-950 border border-slate-800" : "bg-slate-100"
            }`}
          >
            {[
              { id: "password", label: "Đổi mật khẩu", icon: KeyRound },
              { id: "profile", label: "Hồ sơ & Cơ sở", icon: User },
              { id: "logs", label: "Nhật ký bảo mật", icon: History },
            ].map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setErrMsg("");
                  }}
                  className={`py-2.5 px-2 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
                    tab === t.id
                      ? "bg-gradient-to-r from-[#0066b2] to-[#0284c7] text-white shadow"
                      : "opacity-70 hover:opacity-100"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          {errMsg && (
            <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-400 text-xs font-medium">
              ⚠️ {errMsg}
            </div>
          )}

          {/* TAB 1: CHANGE PASSWORD */}
          {tab === "password" && (
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider opacity-80 mb-1.5">
                  Mật khẩu hiện tại
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Nhập mật khẩu đang sử dụng"
                    className={`w-full pl-10 pr-10 py-2.5 rounded-xl border text-sm outline-none ${inputCls}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-sky-400"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider opacity-80 mb-1.5">
                  Mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới (>= 6 ký tự)"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none ${inputCls}`}
                  />
                </div>
                <PasswordStrengthMeter password={newPassword} dark={dark} />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider opacity-80 mb-1.5">
                  Xác nhận mật khẩu mới
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Nhập lại mật khẩu mới"
                    className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none ${inputCls}`}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-2xl font-bold text-sm text-white bg-gradient-to-r from-[#0066b2] to-[#0db14b] hover:brightness-110 transition flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Cập nhật Mật khẩu Mới (Bcrypt Salted)</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* TAB 2: PROFILE & CAMPUS */}
          {tab === "profile" && (
            <div className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-500/10">
                  <div className="text-[11px] opacity-70">Họ và tên</div>
                  <div className="font-bold mt-0.5">{student?.full_name}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-500/10">
                  <div className="text-[11px] opacity-70">Mã số sinh viên</div>
                  <div className="font-mono font-bold text-sky-400 mt-0.5">
                    {student?.student_id}
                  </div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-500/10">
                  <div className="text-[11px] opacity-70">Email FPT</div>
                  <div className="font-mono text-xs mt-0.5 truncate">{student?.email}</div>
                </div>
                <div className="p-3.5 rounded-xl bg-slate-500/10">
                  <div className="text-[11px] opacity-70">Chuyên ngành & Học kỳ</div>
                  <div className="font-bold mt-0.5">
                    {student?.major} · Kỳ {student?.current_semester}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider opacity-80 mb-2">
                  <MapPin className="w-3.5 h-3.5 inline mr-1 text-[#f37021]" />
                  Cơ sở đào tạo (Áp dụng tính đơn giá học phí học lại)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {campuses.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCampusChange(c)}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer ${
                        campus === c
                          ? "border-sky-500 bg-sky-500/15 text-sky-400"
                          : dark
                          ? "border-slate-800 bg-slate-950 hover:border-slate-700"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                      }`}
                    >
                      <div className="font-bold text-xs">FPTU {c}</div>
                      <div className="text-[11px] font-mono opacity-75">
                        {formatVND(tuitionMap[c] || 1840000)}/TC
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SECURITY AUDIT LOGS */}
          {tab === "logs" && (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {authLogs.length === 0 ? (
                <div className="text-center py-8 text-xs opacity-65">
                  Chưa có nhật ký hoạt động bảo mật nào.
                </div>
              ) : (
                authLogs.map((item, idx) => {
                  const meta = EVENT_LABELS[item.event_type] || {
                    label: item.event_type,
                    tone: "text-slate-300 bg-slate-500/15",
                  };
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs flex items-start justify-between gap-3 ${
                        dark ? "bg-slate-950/70 border-slate-800" : "bg-slate-50 border-slate-200"
                      }`}
                    >
                      <div className="space-y-1">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md font-bold text-[11px] ${meta.tone}`}
                        >
                          {meta.label}
                        </span>
                        <div className="opacity-85">{item.detail}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] opacity-65 shrink-0">
                        <div>{item.created_at}</div>
                        <div>IP: {item.ip_address}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
