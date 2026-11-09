import React from "react";
import { CheckCircle2, Circle, AlertTriangle, Info, X } from "lucide-react";
import { evaluatePasswordStrength } from "../lib/api";

export function FptEmblem({ size = "md" }) {
  const boxCls =
    size === "sm"
      ? "px-1.5 py-0.5 text-[10px]"
      : size === "lg"
      ? "px-2.5 py-1 text-sm"
      : "px-2 py-0.5 text-xs";

  return (
    <div className="inline-flex items-center gap-1 select-none">
      <span
        className={`${boxCls} rounded font-extrabold text-white bg-[#0066b2] -skew-x-12 shadow-sm shadow-sky-500/30`}
      >
        F
      </span>
      <span
        className={`${boxCls} rounded font-extrabold text-white bg-[#f37021] -skew-x-12 shadow-sm shadow-orange-500/30`}
      >
        P
      </span>
      <span
        className={`${boxCls} rounded font-extrabold text-white bg-[#0db14b] -skew-x-12 shadow-sm shadow-emerald-500/30`}
      >
        T
      </span>
    </div>
  );
}

export function UniFsWordmark({ size = "md", dark = true }) {
  const textCls =
    size === "xl"
      ? "text-4xl sm:text-5xl"
      : size === "lg"
      ? "text-3xl"
      : size === "sm"
      ? "text-xl"
      : "text-2xl";

  return (
    <span className={`font-display font-extrabold tracking-tight select-none ${textCls}`}>
      <span className={dark ? "text-white" : "text-[#0056d2]"}>Uni</span>
      <span className="text-[#f37021]">F</span>
      <span className="text-[#0db14b]">s</span>
      <span className="ml-1.5 inline-flex items-center align-middle text-[0.42em] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r from-[#0066b2] via-[#f37021] to-[#0db14b] text-white shadow-sm">
        PRO
      </span>
    </span>
  );
}

export function PasswordStrengthMeter({ password, dark = true }) {
  const st = evaluatePasswordStrength(password);
  const items = [
    { ok: st.checks.minLength, text: "Tối thiểu 6 ký tự" },
    { ok: st.checks.hasLetterAndNumber, text: "Kết hợp chữ cái & số" },
    { ok: st.checks.hasUpperLower, text: "Có chữ HOA & thường" },
    { ok: st.checks.hasSpecialOrLong, text: "Ký tự đặc biệt (@#!) hoặc >= 10 ký tự" },
  ];

  return (
    <div className="mt-2.5 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className={dark ? "text-slate-400" : "text-slate-500"}>Độ mạnh bảo mật:</span>
        <span className={`font-semibold ${st.textColor}`}>{st.label}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              st.score >= idx
                ? st.barColor
                : dark
                ? "bg-slate-800"
                : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-0.5">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[11.5px]">
            {it.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Circle
                className={`w-3.5 h-3.5 shrink-0 ${
                  dark ? "text-slate-600" : "text-slate-300"
                }`}
              />
            )}
            <span
              className={
                it.ok
                  ? dark
                    ? "text-emerald-300 font-medium"
                    : "text-emerald-700 font-medium"
                  : dark
                  ? "text-slate-400"
                  : "text-slate-500"
              }
            >
              {it.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed top-18 right-5 z-[100] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((t) => {
        const isErr = t.type === "error";
        const isWarn = t.type === "warning";
        const borderCls = isErr
          ? "border-rose-500/40 bg-slate-900/95 text-rose-100"
          : isWarn
          ? "border-amber-500/40 bg-slate-900/95 text-amber-100"
          : "border-emerald-500/40 bg-slate-900/95 text-emerald-50";

        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-2xl border shadow-2xl backdrop-blur-xl animate-fade-up ${borderCls}`}
          >
            {isErr ? (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            ) : isWarn ? (
              <Info className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 text-sm font-medium leading-snug">{t.message}</div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-slate-400 hover:text-white transition p-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
