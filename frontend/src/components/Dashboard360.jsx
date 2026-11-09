import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  MessageSquarePlus,
  Search,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import { formatVND } from "../lib/api";

function SvgGpaAreaChart({ bySemester = {}, projectedGpa, dark }) {
  const entries = Object.entries(bySemester)
    .map(([k, v]) => ({ sem: Number(k), gpa: Number(v) }))
    .sort((a, b) => a.sem - b.sem);

  if (entries.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-xs opacity-60">
        Chưa có dữ liệu điểm các học kỳ trước.
      </div>
    );
  }

  const points = [...entries];
  if (projectedGpa != null) {
    points.push({
      sem: (entries[entries.length - 1]?.sem || 1) + 1,
      gpa: Number(projectedGpa),
      isProjected: true,
    });
  }

  const W = 560;
  const H = 195;
  const padL = 38;
  const padR = 24;
  const innerX = 28;
  const padT = 24;
  const padB = 30;
  const minY = 4.0;
  const maxY = 10.0;

  const getX = (i) =>
    points.length === 1
      ? W / 2
      : padL + innerX + (i / (points.length - 1)) * (W - padL - padR - innerX * 2);
  const getY = (val) =>
    padT + ((maxY - Math.min(Math.max(val, minY), maxY)) / (maxY - minY)) * (H - padT - padB);

  const solidPts = points.filter((p) => !p.isProjected);
  const linePath = solidPts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${getX(i).toFixed(1)} ${getY(p.gpa).toFixed(1)}`)
    .join(" ");

  const areaPath =
    solidPts.length > 1
      ? `${linePath} L ${getX(solidPts.length - 1).toFixed(1)} ${H - padB} L ${getX(0).toFixed(
          1
        )} ${H - padB} Z`
      : "";

  const projLine =
    points.length >= 2 && points[points.length - 1].isProjected
      ? `M ${getX(points.length - 2).toFixed(1)} ${getY(
          points[points.length - 2].gpa
        ).toFixed(1)} L ${getX(points.length - 1).toFixed(1)} ${getY(
          points[points.length - 1].gpa
        ).toFixed(1)}`
      : "";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-52 overflow-visible">
      <defs>
        <linearGradient id="gpaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Horizontal Grid Lines */}
      {[5, 6.5, 8, 9.5].map((gv) => {
        const y = getY(gv);
        return (
          <g key={gv}>
            <line
              x1={padL}
              y1={y}
              x2={W - padR}
              y2={y}
              stroke={dark ? "rgba(148,163,184,0.14)" : "rgba(100,116,139,0.18)"}
              strokeDasharray="4 4"
            />
            <text
              x={padL - 8}
              y={y + 4}
              textAnchor="end"
              className="text-[10px] fill-slate-400 font-mono"
            >
              {gv.toFixed(1)}
            </text>
          </g>
        );
      })}

      {areaPath && <path d={areaPath} fill="url(#gpaGrad)" />}
      {linePath && (
        <path
          d={linePath}
          fill="none"
          stroke="#0284c7"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {projLine && (
        <path
          d={projLine}
          fill="none"
          stroke="#f37021"
          strokeWidth="2.5"
          strokeDasharray="5 4"
        />
      )}

      {points.map((p, idx) => {
        const cx = getX(idx);
        const cy = getY(p.gpa);
        return (
          <g key={idx}>
            <circle
              cx={cx}
              cy={cy}
              r={p.isProjected ? 5.5 : 5}
              fill={p.isProjected ? "#f37021" : "#0ea5e9"}
              stroke={dark ? "#0f172a" : "#ffffff"}
              strokeWidth="2"
            />
            <text
              x={cx}
              y={cy - 10}
              textAnchor="middle"
              className={`text-[10.5px] font-mono font-bold ${
                p.isProjected
                  ? "fill-orange-400"
                  : dark
                  ? "fill-slate-200"
                  : "fill-slate-700"
              }`}
            >
              {p.gpa.toFixed(2)}
            </text>
            <text
              x={cx}
              y={H - 8}
              textAnchor="middle"
              className="text-[10px] fill-slate-400 font-medium"
            >
              {p.isProjected ? "Dự báo TN" : `Kỳ ${p.sem}`}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function CreditRing({ percent = 0 }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(Math.max(percent, 0), 100) / 100) * c;
  return (
    <svg className="w-18 h-18 -rotate-90 shrink-0" viewBox="0 0 76 76">
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke="rgba(148,163,184,0.2)"
        strokeWidth="7"
      />
      <circle
        cx="38"
        cy="38"
        r={r}
        fill="none"
        stroke="#0db14b"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

export default function Dashboard360({ dark, overview, onAskAiAbout }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [semFilter, setSemFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  if (!overview) {
    return (
      <div className="p-8 text-center text-sm opacity-70">
        Đang tải dữ liệu Dashboard Học vụ 360°...
      </div>
    );
  }

  const {
    profile,
    gpa,
    progress,
    forecast,
    eligibility,
    attendance,
    coursework,
    schedule,
    retake_fee,
    transcript,
  } = overview;

  const cardCls = dark
    ? "bg-slate-900/75 border-slate-800/90 text-slate-100"
    : "bg-white border-slate-200/90 text-slate-900 shadow-xs";

  const realGrad = forecast?.realistic_graduation_forecast || {};
  const acadForecast = forecast?.academic_standing_forecast || {};
  const ojt = eligibility?.ojt_eligibility || {};
  const failedItems = progress?.failed_pending_retake || [];

  const filteredRows = useMemo(() => {
    const rows = transcript?.rows || [];
    return rows.filter((r) => {
      if (semFilter !== "ALL" && String(r.semester) !== String(semFilter)) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        if (
          !r.subject_code.toLowerCase().includes(q) &&
          !(r.subject_name || "").toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [transcript, semFilter, statusFilter, searchTerm]);

  const scheduleDays = [
    "Thứ 2",
    "Thứ 3",
    "Thứ 4",
    "Thứ 5",
    "Thứ 6",
    "Thứ 7",
    "Chủ nhật",
  ];

  // Match dynamic day keys like "Thứ 2 (19/10)"
  const findDayEntry = (daysObj, shortDay) => {
    if (!daysObj) return null;
    const key = Object.keys(daysObj).find((k) =>
      k.toLowerCase().startsWith(shortDay.toLowerCase())
    );
    return key ? { label: key, data: daysObj[key] } : null;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-up">
      {/* Smart Risk Alert Banner */}
      {(attendance?.is_attendance_fail ||
        (attendance?.remaining_allowed_absent != null &&
          attendance.remaining_allowed_absent <= 1) ||
        failedItems.length > 0) && (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            attendance?.is_attendance_fail
              ? "bg-rose-500/12 border-rose-500/40 text-rose-300"
              : "bg-amber-500/12 border-amber-500/40 text-amber-300"
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs sm:text-sm">
              <div className="font-bold">
                {attendance?.is_attendance_fail
                  ? `🚨 CẢNH BÁO CẤM THI (AF) MÔN ${attendance.subject_code}!`
                  : attendance?.remaining_allowed_absent <= 1
                  ? `⚠️ Cảnh báo chuyên cần môn ${attendance.subject_code}: Chỉ còn phép vắng ${attendance.remaining_allowed_absent} buổi!`
                  : `📌 Bạn đang có ${failedItems.length} môn nợ cần đăng ký học lại sớm (ưu đãi 50% học phí).`}
              </div>
              <div className="opacity-90 text-xs">
                {attendance?.warning_status ||
                  `Tổng học phí học lại dự kiến tại cơ sở ${profile?.campus}: ${formatVND(
                    retake_fee?.total
                  )}`}
              </div>
            </div>
          </div>
          <button
            onClick={() =>
              onAskAiAbout(
                "Phân tích ngay rủi ro điểm danh, các môn đang nợ của mình và lập kế hoạch xử lý tối ưu trong kỳ tới!"
              )
            }
            className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold bg-white/15 hover:bg-white/25 transition cursor-pointer"
          >
            Nhờ AI lập phương án xử lý →
          </button>
        </div>
      )}

      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Card 1: GPA */}
        <div className={`p-5 rounded-2xl border ${cardCls}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
              GPA Tích lũy (Thang 10)
            </span>
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="text-3xl font-extrabold font-mono text-sky-400">
              {gpa?.gpa != null ? gpa.gpa.toFixed(2) : "--"}
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400">
              {gpa?.classification || "Chưa xếp loại"}
            </span>
          </div>
          <div className="mt-2 text-xs opacity-75">
            {acadForecast.gpa_trend_description || "Ổn định"} · Đã tính {gpa?.credits_counted || 0} TC
          </div>
        </div>

        {/* Card 2: Credit Progress */}
        <div className={`p-5 rounded-2xl border flex items-center justify-between gap-3 ${cardCls}`}>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Tiến độ Chương trình
            </span>
            <div className="mt-2 text-2xl font-extrabold font-mono text-emerald-400">
              {progress?.credits_passed}/{progress?.credits_total} <span className="text-sm">TC</span>
            </div>
            <div className="mt-1.5 text-xs opacity-75">
              Đang học {progress?.studying?.length || 0} môn · Nợ {failedItems.length} môn
            </div>
          </div>
          <div className="relative flex items-center justify-center">
            <CreditRing percent={progress?.percent || 0} />
            <span className="absolute text-xs font-extrabold font-mono">
              {progress?.percent || 0}%
            </span>
          </div>
        </div>

        {/* Card 3: Attendance Status */}
        <div className={`p-5 rounded-2xl border ${cardCls}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Điểm danh Chuyên cần
            </span>
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                attendance?.is_attendance_fail
                  ? "bg-rose-500/15 text-rose-400"
                  : "bg-orange-500/15 text-orange-400"
              }`}
            >
              <Clock className="w-5 h-5" />
            </div>
          </div>
          {attendance?.subject_code ? (
            <>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xl font-extrabold font-mono">
                  {attendance.subject_code}
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    attendance.is_attendance_fail
                      ? "bg-rose-500/20 text-rose-400"
                      : "bg-emerald-500/20 text-emerald-400"
                  }`}
                >
                  Vắng {attendance.absent_slots}/{attendance.total_slots} slot
                </span>
              </div>
              <div className="mt-2 text-xs opacity-75">
                {attendance.is_attendance_fail
                  ? "Đã vượt ngưỡng 20% — Bị cấm thi AF"
                  : `Còn được phép nghỉ tối đa ${attendance.remaining_allowed_absent} buổi`}
              </div>
            </>
          ) : (
            <div className="mt-4 text-xs opacity-70">Chưa có bản ghi điểm danh kỳ này.</div>
          )}
        </div>

        {/* Card 4: AI Graduation Forecast */}
        <div className={`p-5 rounded-2xl border ${cardCls}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider opacity-70">
              Dự báo Tốt nghiệp AI
            </span>
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 text-violet-400 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-violet-400">
              {realGrad.finish_semester || `Năm ${realGrad.graduation_year || 2028}`}
            </span>
          </div>
          <div className="mt-2 text-xs opacity-80">
            Dự kiến bằng: <b>{acadForecast.projected_graduation_classification || "Khá"}</b> (
            {acadForecast.projected_graduation_gpa || "--"}) · OJT:{" "}
            <b className={ojt.is_eligible_now ? "text-emerald-400" : "text-amber-400"}>
              {ojt.current_percentage || 0}%
            </b>
          </div>
        </div>
      </div>

      {/* Middle Row: GPA Chart + Attendance Slot Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* GPA Trend Chart */}
        <div className={`lg:col-span-7 p-5 sm:p-6 rounded-2xl border ${cardCls}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                <span>Biểu đồ Biến động GPA & Dự phóng Tốt nghiệp</span>
              </h3>
              <p className="text-xs opacity-65 mt-0.5">
                Đường liền: GPA thực tế từng học kỳ · Đường nét đứt cam: Dự báo AI khi ra trường
              </p>
            </div>
          </div>
          <SvgGpaAreaChart
            bySemester={gpa?.by_semester || {}}
            projectedGpa={acadForecast.projected_graduation_gpa}
            dark={dark}
          />
        </div>

        {/* 20-Slot Visual Attendance Tracker */}
        <div className={`lg:col-span-5 p-5 sm:p-6 rounded-2xl border flex flex-col justify-between ${cardCls}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-bold text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#f37021]" />
                <span>Theo dõi Slot Điểm danh (Quy tắc 20% AF)</span>
              </h3>
              {attendance?.class_name && (
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-500/15">
                  {attendance.class_name}
                </span>
              )}
            </div>

            {attendance?.subject_code ? (
              <div className="space-y-4 mt-3">
                <div className="text-xs opacity-80">
                  Môn <b>{attendance.subject_code} – {attendance.subject_name}</b> · GV:{" "}
                  <b>{attendance.lecturer}</b>
                </div>

                {/* Danger Quota Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span>Đã vắng: <b>{attendance.absent_slots}</b> buổi</span>
                    <span>Giới hạn tối đa (20%): <b>{attendance.max_allowed_absent}</b> buổi</span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-500/20 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        attendance.is_attendance_fail
                          ? "bg-rose-500"
                          : attendance.remaining_allowed_absent <= 1
                          ? "bg-amber-500"
                          : "bg-emerald-500"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          (attendance.absent_slots / Math.max(attendance.max_allowed_absent, 1)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Slot Pills Matrix */}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider opacity-70 mb-2">
                    Chi tiết {attendance.total_slots} buổi học trong kỳ:
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 lg:grid-cols-5 gap-1.5">
                    {Array.from({ length: attendance.total_slots || 20 }).map((_, idx) => {
                      const rec = (attendance.records || [])[idx];
                      const st = rec?.status || "Chưa học";
                      const isPresent = st.toLowerCase().includes("có mặt") || st.toLowerCase().includes("present");
                      const isAbsent = st.toLowerCase().includes("vắng") || st.toLowerCase().includes("absent");

                      return (
                        <div
                          key={idx}
                          title={`Slot ${idx + 1}${rec?.date ? ` - ${rec.date}` : ""}: ${st}`}
                          className={`py-1.5 rounded-lg text-center font-mono text-xs font-bold border transition ${
                            isPresent
                              ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-400"
                              : isAbsent
                              ? "bg-rose-500/20 border-rose-500/45 text-rose-400"
                              : dark
                              ? "bg-slate-950/60 border-slate-800 text-slate-500"
                              : "bg-slate-50 border-slate-200 text-slate-400"
                          }`}
                        >
                          S{idx + 1}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs opacity-65 py-8 text-center">
                Chưa đồng bộ dữ liệu điểm danh chi tiết từ FAP.
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 text-[11px] pt-4 mt-3 border-t border-slate-500/15">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" /> Có mặt
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> Vắng mặt
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-slate-500/40 inline-block" /> Chưa học
            </span>
          </div>
        </div>
      </div>

      {/* Parallel FAP Extension Synced Row: Multi-Course Attendance & Mark Report Component Grades */}
      {((attendance?.courses && attendance.courses.length > 1) ||
        (coursework?.courses && coursework.courses.length > 0)) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {attendance?.courses && attendance.courses.length > 1 && (
            <div className={`lg:col-span-5 p-5 sm:p-6 rounded-2xl border space-y-3 ${cardCls}`}>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#f37021]" />
                <span>Điểm danh Đa môn từ FAP Extension ({attendance.courses.length} lớp)</span>
              </h3>
              <div className="space-y-2.5">
                {attendance.courses.map((c) => (
                  <div
                    key={c.subject_code}
                    className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      c.is_attendance_fail
                        ? "bg-rose-500/10 border-rose-500/35"
                        : c.remaining_allowed_absent <= 1
                        ? "bg-amber-500/10 border-amber-500/35"
                        : dark
                        ? "bg-slate-950/50 border-slate-800"
                        : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div>
                      <div className="font-mono font-bold text-sky-400">
                        {c.subject_code} <span className="font-sans font-normal opacity-80">· {c.subject_name}</span>
                      </div>
                      <div className="opacity-75 mt-0.5">
                        Đã vắng <b>{c.absent_slots}/{c.total_slots}</b> buổi ({c.absent_rate_total})
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-full font-bold text-[11px] shrink-0 ${
                        c.is_attendance_fail
                          ? "bg-rose-500 text-white"
                          : c.remaining_allowed_absent <= 1
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {c.is_attendance_fail ? "Cấm thi AF" : `Còn ${c.remaining_allowed_absent} buổi`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {coursework?.courses && coursework.courses.length > 0 && (
            <div
              className={`${
                attendance?.courses && attendance.courses.length > 1 ? "lg:col-span-7" : "lg:col-span-12"
              } p-5 sm:p-6 rounded-2xl border space-y-3 ${cardCls}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-base flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span>Bảng Điểm Thành Phần FAP & Mục Tiêu Final Exam ({coursework.courses.length} môn)</span>
                </h3>
                <button
                  onClick={() =>
                    onAskAiAbout(
                      "Phân tích bảng điểm thành phần kỳ này từ FAP và tính chiến lược điểm thi Final Exam cho từng môn!"
                    )
                  }
                  className="text-xs font-bold text-sky-400 hover:underline cursor-pointer"
                >
                  Nhờ AI lập chiến lược FE →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {coursework.courses.map((cw) => (
                  <div
                    key={cw.subject_code}
                    className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                      dark ? "bg-slate-950/55 border-slate-800" : "bg-slate-50 border-slate-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-extrabold text-sky-400">{cw.subject_code}</span>
                      <span>
                        TB Quá trình: <b className="font-mono text-emerald-400">{cw.coursework_average ?? "--"}</b>
                      </span>
                    </div>
                    <div className="text-[11px] opacity-80 truncate">{cw.subject_name}</div>
                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-500/15 text-[11px]">
                      <span>
                        Qua môn: <b className="font-mono text-[#f37021]">FE &gt;= {cw.required_fe_to_pass ?? "--"}</b>
                      </span>
                      <span>
                        Đạt Giỏi: <b className="font-mono text-sky-400">FE &gt;= {cw.required_fe_for_good ?? "--"}</b>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weekly Timetable Grid */}
      {schedule?.schedule && Array.isArray(schedule.schedule) && schedule.schedule.length > 0 && (
        <div className={`p-5 sm:p-6 rounded-2xl border ${cardCls}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="font-bold text-base flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#0db14b]" />
                <span>Thời khóa biểu Tuần ({schedule.week || "Học kỳ hiện tại"})</span>
              </h3>
              <p className="text-xs opacity-65 mt-0.5">
                Đồng bộ lịch học phòng, giảng viên và trạng thái điểm danh theo từng Slot
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse min-w-[760px]">
              <thead>
                <tr className={dark ? "bg-slate-950/70" : "bg-slate-100"}>
                  <th className="p-2.5 text-left border border-slate-500/20 w-28">Ca học</th>
                  {scheduleDays.map((d) => (
                    <th key={d} className="p-2.5 text-left border border-slate-500/20">
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.schedule.map((slotRow, sIdx) => (
                  <tr key={sIdx}>
                    <td className="p-2.5 border border-slate-500/20 align-top">
                      <div className="font-bold text-sky-400">Slot {slotRow.slot}</div>
                      <div className="text-[11px] opacity-70 font-mono">{slotRow.time}</div>
                    </td>
                    {scheduleDays.map((d) => {
                      const entry = findDayEntry(slotRow.days, d);
                      const cell = entry?.data;
                      return (
                        <td key={d} className="p-2 border border-slate-500/20 align-top">
                          {cell ? (
                            <div
                              className={`p-2 rounded-xl border space-y-1 ${
                                dark
                                  ? "bg-sky-500/10 border-sky-500/30"
                                  : "bg-sky-50 border-sky-200"
                              }`}
                            >
                              <div className="font-mono font-extrabold text-sky-400">
                                {cell.subject_code}
                              </div>
                              <div className="text-[11px] font-medium">
                                Phòng <b>{cell.room}</b> · {cell.lecturer}
                              </div>
                              <div className="flex items-center justify-between pt-0.5">
                                <span className="text-[10px] opacity-70">{cell.class_name}</span>
                                <span
                                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    cell.status === "Có mặt"
                                      ? "bg-emerald-500/20 text-emerald-400"
                                      : cell.status === "Vắng mặt"
                                      ? "bg-rose-500/20 text-rose-400"
                                      : "bg-slate-500/20 opacity-80"
                                  }`}
                                >
                                  {cell.status}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="opacity-25 text-[11px]">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Full Filterable Transcript Table */}
      <div className={`p-5 sm:p-6 rounded-2xl border ${cardCls}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-sky-400" />
              <span>Bảng điểm Học vụ Chi tiết ({filteredRows.length} bản ghi)</span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm mã hoặc tên môn..."
                className={`pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none ${
                  dark
                    ? "bg-slate-950 border-slate-800 text-slate-200"
                    : "bg-slate-50 border-slate-200 text-slate-800"
                }`}
              />
            </div>

            <select
              value={semFilter}
              onChange={(e) => setSemFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border text-xs outline-none ${
                dark
                  ? "bg-slate-950 border-slate-800 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <option value="ALL">Tất cả học kỳ</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => (
                <option key={s} value={s}>
                  Học kỳ {s}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border text-xs outline-none ${
                dark
                  ? "bg-slate-950 border-slate-800 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <option value="ALL">Mọi trạng thái</option>
              <option value="Passed">Đã qua (Passed)</option>
              <option value="Studying">Đang học (Studying)</option>
              <option value="Failed">Đang nợ (Failed)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-xs sm:text-sm border-collapse">
            <thead>
              <tr
                className={`border-b text-left ${
                  dark ? "border-slate-800 text-slate-400" : "border-slate-200 text-slate-500"
                }`}
              >
                <th className="py-2.5 px-3">Kỳ</th>
                <th className="py-2.5 px-3">Mã môn</th>
                <th className="py-2.5 px-3">Tên môn học</th>
                <th className="py-2.5 px-3 text-center">Tín chỉ</th>
                <th className="py-2.5 px-3 text-center">Điểm tổng kết</th>
                <th className="py-2.5 px-3 text-center">Trạng thái</th>
                <th className="py-2.5 px-3 text-right">Tư vấn AI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-500/15">
              {filteredRows.map((r, i) => (
                <tr
                  key={i}
                  className={dark ? "hover:bg-slate-800/40" : "hover:bg-slate-50"}
                >
                  <td className="py-2.5 px-3 font-mono">Kỳ {r.semester}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-sky-400">
                    {r.subject_code}
                  </td>
                  <td className="py-2.5 px-3 font-medium">{r.subject_name}</td>
                  <td className="py-2.5 px-3 text-center font-mono">{r.credits}</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold">
                    {r.grade != null ? r.grade.toFixed(1) : "—"}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                        r.status === "Passed"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : r.status === "Studying"
                          ? "bg-sky-500/15 text-sky-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}
                    >
                      {r.status === "Passed" && <CheckCircle2 className="w-3 h-3" />}
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      onClick={() =>
                        onAskAiAbout(
                          `Kiểm tra chi tiết môn ${r.subject_code} (${r.subject_name}), chuỗi môn mở khóa phía sau và tư vấn học tập cho mình!`
                        )
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-sky-500/10 text-sky-400 hover:bg-sky-500 hover:text-white transition cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>Hỏi AI</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
