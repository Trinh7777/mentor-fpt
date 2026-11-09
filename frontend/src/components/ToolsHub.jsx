import React, { useEffect, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Coins,
  GraduationCap,
  Sliders,
  Target,
} from "lucide-react";
import { apiRequest, formatVND } from "../lib/api";

export default function ToolsHub({ dark, overview, pushToast }) {
  const catalog = overview?.subjects_catalog || [];
  const studyingList = overview?.progress?.studying || [];
  const failedList = overview?.progress?.failed_pending_retake || [];
  const eligibility = overview?.eligibility || {};
  const retakeFee = overview?.retake_fee || {};

  // 1. FE Score Calculator State
  const [feSubj, setFeSubj] = useState(
    studyingList[0]?.subject_code || "DPL302m"
  );
  const [courseworkAvg, setCourseworkAvg] = useState(6.8);
  const [targetTotal, setTargetTotal] = useState(5.0);
  const [feResult, setFeResult] = useState(null);

  // 2. What-If GPA Simulator State
  const [simGrades, setSimGrades] = useState({});
  const [simResult, setSimResult] = useState(null);

  // 3. Target Graduation GPA Planner
  const [gradTarget, setGradTarget] = useState(8.0);
  const [gradPlan, setGradPlan] = useState(null);

  // Initialize simulation sliders from studying + failed subjects
  useEffect(() => {
    const init = {};
    studyingList.forEach((s) => {
      init[s.subject_code] = 8.0;
    });
    failedList.forEach((f) => {
      init[f.subject_code] = 7.0;
    });
    if (Object.keys(init).length === 0) {
      init["DPL302m"] = 8.0;
      init["BDI302c"] = 7.5;
    }
    setSimGrades(init);
  }, [overview]);

  // Live calculate FE
  useEffect(() => {
    const timer = setTimeout(() => {
      apiRequest("/api/tools/fe-calculator", {
        method: "POST",
        body: JSON.stringify({
          coursework_avg: Number(courseworkAvg),
          subject_code: feSubj,
          target_total: Number(targetTotal),
        }),
      })
        .then(setFeResult)
        .catch(() => {});
    }, 120);
    return () => clearTimeout(timer);
  }, [feSubj, courseworkAvg, targetTotal]);

  // Live calculate What-If GPA
  useEffect(() => {
    if (Object.keys(simGrades).length === 0) return;
    const timer = setTimeout(() => {
      apiRequest("/api/tools/simulate-gpa", {
        method: "POST",
        body: JSON.stringify({ expected_grades: simGrades }),
      })
        .then(setSimResult)
        .catch(() => {});
    }, 150);
    return () => clearTimeout(timer);
  }, [simGrades]);

  // Live calculate Target Graduation GPA
  useEffect(() => {
    const timer = setTimeout(() => {
      apiRequest("/api/tools/target-gpa", {
        method: "POST",
        body: JSON.stringify({ target_gpa: Number(gradTarget) }),
      })
        .then(setGradPlan)
        .catch(() => {});
    }, 120);
    return () => clearTimeout(timer);
  }, [gradTarget]);

  const cardCls = dark
    ? "bg-slate-900/75 border-slate-800/90 text-slate-100"
    : "bg-white border-slate-200/90 text-slate-900 shadow-xs";

  const ojt = eligibility.ojt_eligibility || {};
  const cap = eligibility.capstone_and_graduation || {};

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-up">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* TOOL 1: FINAL EXAM (FE) SCORE CALCULATOR */}
        <div className={`lg:col-span-6 p-6 rounded-2xl border space-y-5 ${cardCls}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-base flex items-center gap-2">
                <Calculator className="w-5 h-5 text-[#f37021]" />
                <span>Máy Tính Điểm Thi Final Exam (FE) FPTU</span>
              </h3>
              <p className="text-xs opacity-70 mt-0.5">
                Kiểm tra đồng thời Tổng kết &ge; 5.0 VÀ Điểm sàn FE &ge; 4.0 (không liệt)
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider opacity-75 mb-1.5">
                Chọn môn học cần tính
              </label>
              <select
                value={feSubj}
                onChange={(e) => setFeSubj(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs sm:text-sm font-medium outline-none ${
                  dark
                    ? "bg-slate-950 border-slate-800 text-slate-100"
                    : "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                {catalog.map((s) => (
                  <option key={s.subject_code} value={s.subject_code}>
                    [Kỳ {s.semester}] {s.subject_code} — {s.subject_name} (FE{" "}
                    {Math.round((s.fe_weight || 0) * 100)}%)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>Điểm trung bình quá trình (PT / Assignment / Lab):</span>
                <span className="font-mono text-sky-400 font-extrabold text-sm">
                  {Number(courseworkAvg).toFixed(1)} / 10
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="0.1"
                value={courseworkAvg}
                onChange={(e) => setCourseworkAvg(parseFloat(e.target.value))}
                className="w-full accent-[#0066b2] cursor-pointer"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2">
                Mục tiêu điểm tổng kết môn:
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { val: 5.0, label: "Qua môn (5.0)" },
                  { val: 7.0, label: "Khá (7.0)" },
                  { val: 8.0, label: "Giỏi (8.0)" },
                  { val: 9.0, label: "Xuất sắc (9.0)" },
                ].map((t) => (
                  <button
                    key={t.val}
                    type="button"
                    onClick={() => setTargetTotal(t.val)}
                    className={`py-2 px-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      targetTotal === t.val
                        ? "bg-gradient-to-r from-[#f37021] to-amber-500 text-white border-transparent shadow"
                        : dark
                        ? "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                        : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {feResult && (
            <div
              className={`p-4 rounded-2xl border ${
                feResult.message
                  ? "bg-sky-500/10 border-sky-500/30"
                  : feResult.required_fe_score > 10
                  ? "bg-rose-500/12 border-rose-500/40"
                  : feResult.required_fe_score <= 5.5
                  ? "bg-emerald-500/12 border-emerald-500/40"
                  : "bg-amber-500/12 border-amber-500/40"
              }`}
            >
              {feResult.message ? (
                <div className="text-xs leading-relaxed">{feResult.message}</div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="text-xs font-semibold uppercase tracking-wider opacity-75">
                      Điểm Final Exam (FE) tối thiểu cần đạt:
                    </div>
                    <div className="text-xs opacity-90">{feResult.verdict}</div>
                    <div className="text-[11px] opacity-70 font-mono">
                      Quá trình ({feResult.coursework_weight_pct}%):{" "}
                      {feResult.coursework_points_accumulated}đ · Sàn liệt FE:{" "}
                      {feResult.fpt_min_fe_floor}đ
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-3xl font-extrabold font-mono text-[#f37021]">
                      {feResult.required_fe_score > 10
                        ? "> 10"
                        : feResult.required_fe_score.toFixed(2)}
                    </div>
                    <div className="text-[11px] opacity-75">trên thang 10</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* TOOL 2: INTERACTIVE WHAT-IF GPA SIMULATOR */}
        <div className={`lg:col-span-6 p-6 rounded-2xl border space-y-5 ${cardCls}`}>
          <div>
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <Sliders className="w-5 h-5 text-sky-400" />
              <span>Giả lập GPA Học kỳ & Tích lũy (What-If Simulation)</span>
            </h3>
            <p className="text-xs opacity-70 mt-0.5">
              Kéo thanh trượt điểm dự kiến các môn đang học / học lại để xem GPA tích lũy thay đổi tức thì
            </p>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {Object.entries(simGrades).map(([code, gradeVal]) => {
              const subjObj = catalog.find((x) => x.subject_code === code);
              return (
                <div
                  key={code}
                  className={`p-3 rounded-xl border ${
                    dark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span>
                      <b className="font-mono text-sky-400">{code}</b>{" "}
                      <span className="opacity-75">— {subjObj?.subject_name || ""}</span>
                    </span>
                    <span
                      className={`font-mono font-extrabold px-2 py-0.5 rounded ${
                        gradeVal >= 5.0
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-rose-500/15 text-rose-400"
                      }`}
                    >
                      {Number(gradeVal).toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={gradeVal}
                    onChange={(e) =>
                      setSimGrades((prev) => ({
                        ...prev,
                        [code]: parseFloat(e.target.value),
                      }))
                    }
                    className="w-full accent-sky-500 cursor-pointer"
                  />
                </div>
              );
            })}
          </div>

          {simResult && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-sky-500/10 border border-sky-500/30 text-center">
                <div className="text-[11px] opacity-75">GPA Kỳ dự kiến</div>
                <div className="text-xl font-extrabold font-mono text-sky-400 mt-1">
                  {simResult.semester_gpa_projected != null
                    ? simResult.semester_gpa_projected.toFixed(2)
                    : "--"}
                </div>
                <div className="text-[10px] font-semibold opacity-80">
                  {simResult.semester_classification || ""}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
                <div className="text-[11px] opacity-75">GPA Tích lũy Mới</div>
                <div className="text-xl font-extrabold font-mono text-emerald-400 mt-1">
                  {simResult.cumulative_gpa_after?.toFixed(2)}
                </div>
                <div className="text-[10px] font-bold text-emerald-400">
                  {simResult.classification_after}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-500/10 border border-slate-500/25 text-center">
                <div className="text-[11px] opacity-75">Biến động GPA</div>
                <div
                  className={`text-xl font-extrabold font-mono mt-1 ${
                    simResult.gpa_delta >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {simResult.gpa_delta >= 0
                    ? `+${simResult.gpa_delta.toFixed(2)}`
                    : simResult.gpa_delta.toFixed(2)}
                </div>
                <div className="text-[10px] opacity-75">
                  Trước: {simResult.cumulative_gpa_before?.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row: Target Graduation GPA + OJT/Capstone Eligibility + Retake Fee */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* OJT & Capstone Checklist */}
        <div className={`lg:col-span-5 p-6 rounded-2xl border space-y-4 ${cardCls}`}>
          <h3 className="font-extrabold text-base flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-emerald-400" />
            <span>Xét Điều Kiện Thực Tập OJT202 & Khóa Luận AIP491</span>
          </h3>

          <div className="p-4 rounded-xl bg-slate-500/10 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>1. Thực tập Doanh nghiệp (OJT202 — Yêu cầu &ge; 90% TC Kỳ 1–5)</span>
              <span
                className={`px-2 py-0.5 rounded-full ${
                  ojt.is_eligible_now
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-amber-500/20 text-amber-400"
                }`}
              >
                {ojt.is_eligible_now ? "Đủ ĐK" : `${ojt.current_percentage || 0}%`}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-500/25 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${Math.min(100, ojt.current_percentage || 0)}%` }}
              />
            </div>
            <div className="text-[11px] opacity-75">
              Đã tích lũy: <b>{ojt.pre_ojt_credits_passed}/{ojt.pre_ojt_credits_total} TC</b> · Dự kiến hết kỳ này:{" "}
              <b>{ojt.projected_percentage_after_this_term}%</b>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-bold">
              2. Điều kiện bắt buộc ngoài GPA khi xét Tốt nghiệp:
            </div>
            {(cap.mandatory_non_gpa_checklist || []).map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs opacity-85">
                <CheckCircle2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Target Graduation GPA & Retake Fee */}
        <div className={`lg:col-span-7 p-6 rounded-2xl border space-y-5 ${cardCls}`}>
          <div>
            <h3 className="font-extrabold text-base flex items-center gap-2">
              <Target className="w-5 h-5 text-sky-400" />
              <span>Hoạch định Hạng Bằng Tốt Nghiệp & Dự Toán Học Phí Học Lại</span>
            </h3>
          </div>

          {/* Target GPA Slider */}
          <div className="p-4 rounded-xl bg-sky-500/8 border border-sky-500/25 space-y-3">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>GPA Tốt nghiệp mục tiêu mong muốn:</span>
              <span className="font-mono text-base text-sky-400">
                {Number(gradTarget).toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min="5.5"
              max="9.5"
              step="0.1"
              value={gradTarget}
              onChange={(e) => setGradTarget(parseFloat(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
            {gradPlan && (
              <div className="text-xs leading-relaxed">
                {gradPlan.required_average_on_remaining != null ? (
                  <>
                    Để đạt GPA <b>{gradPlan.target_gpa}</b>, bạn cần đạt trung bình{" "}
                    <b className="font-mono text-sm text-[#f37021]">
                      {gradPlan.required_average_on_remaining}
                    </b>{" "}
                    trên <b>{gradPlan.credits_remaining} tín chỉ</b> còn lại →{" "}
                    <span className="font-bold text-emerald-400">{gradPlan.verdict}</span>.
                  </>
                ) : (
                  gradPlan.message
                )}
              </div>
            )}
          </div>

          {/* Retake Fee Breakdown */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-400" />
                Bảng dự toán học phí học lại ({retakeFee.campus} —{" "}
                {formatVND(retakeFee.price_per_credit)}/TC)
              </span>
              <span className="font-mono text-sm text-amber-400">
                Tổng: {formatVND(retakeFee.total || 0)}
              </span>
            </div>

            {retakeFee.items && retakeFee.items.length > 0 ? (
              <div className="space-y-2">
                {retakeFee.items.map((it) => (
                  <div
                    key={it.subject_code}
                    className="p-3 rounded-xl border border-rose-500/25 bg-rose-500/8 flex items-center justify-between text-xs"
                  >
                    <div>
                      <span className="font-mono font-bold text-rose-400">
                        {it.subject_code}
                      </span>{" "}
                      — {it.name} ({it.credits} TC)
                      <div className="text-[11px] opacity-75">
                        {it.is_early_retake
                          ? "✨ Học lại sớm (ưu đãi 50% học phí theo QĐ 107)"
                          : "Học lại tiêu chuẩn (100% học phí)"}
                      </div>
                    </div>
                    <span className="font-mono font-bold text-amber-400">
                      {formatVND(it.fee_applied)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-400 font-semibold">
                🎉 Tuyệt vời! Hiện tại bạn không có môn nợ nào tồn đọng (0đ phí học lại).
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
