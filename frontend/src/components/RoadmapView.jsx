import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  GitBranch,
  Lock,
  MessageSquarePlus,
  PlayCircle,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";

const STATE_META = {
  Passed: {
    label: "Đã qua",
    icon: CheckCircle2,
    card: "border-emerald-500/35 bg-emerald-500/10 hover:border-emerald-400",
    badge: "bg-emerald-500/20 text-emerald-400",
  },
  Studying: {
    label: "Đang học",
    icon: PlayCircle,
    card: "border-sky-500/40 bg-sky-500/12 hover:border-sky-400",
    badge: "bg-sky-500/20 text-sky-400",
  },
  Failed: {
    label: "Đang nợ",
    icon: XCircle,
    card: "border-rose-500/45 bg-rose-500/12 hover:border-rose-400",
    badge: "bg-rose-500/20 text-rose-400",
  },
  Available: {
    label: "Đủ điều kiện",
    icon: Sparkles,
    card: "border-amber-500/35 bg-amber-500/8 hover:border-amber-400",
    badge: "bg-amber-500/20 text-amber-400",
  },
  Locked: {
    label: "Kẹt tiên quyết",
    icon: Lock,
    card: "border-slate-700/60 bg-slate-800/30 opacity-75 hover:opacity-100",
    badge: "bg-slate-500/20 text-slate-400",
  },
};

export default function RoadmapView({ dark, roadmapData, onAskAiAbout }) {
  const [filterState, setFilterState] = useState("ALL");
  const [searchQ, setSearchQ] = useState("");
  const [selectedSubj, setSelectedSubj] = useState(null);

  const semesters = roadmapData?.semesters || {};

  const counts = useMemo(() => {
    const acc = { ALL: 0, Passed: 0, Studying: 0, Failed: 0, Available: 0, Locked: 0 };
    Object.values(semesters).forEach((list) => {
      list.forEach((item) => {
        acc.ALL += 1;
        acc[item.state] = (acc[item.state] || 0) + 1;
      });
    });
    return acc;
  }, [semesters]);

  if (!roadmapData) {
    return (
      <div className="p-8 text-center text-sm opacity-70">
        Đang tải Sơ đồ Cây môn học 9 kỳ...
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-fade-up">
      {/* Header & Filter Bar */}
      <div
        className={`p-5 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          dark ? "bg-slate-900/75 border-slate-800" : "bg-white border-slate-200 shadow-xs"
        }`}
      >
        <div>
          <h2 className="text-lg font-extrabold flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-[#f37021]" />
            <span>Sơ đồ Cây Môn Học 9 Kỳ & Chuỗi Tiên Quyết</span>
          </h2>
          <p className="text-xs opacity-70 mt-0.5">
            Bấm vào bất kỳ môn học nào để kiểm tra điều kiện tiên quyết và các môn được mở khóa phía sau
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Tìm môn (VD: DPL302m)..."
              className={`pl-8 pr-3 py-1.5 rounded-xl border text-xs outline-none ${
                dark
                  ? "bg-slate-950 border-slate-800 text-slate-200"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            />
          </div>

          {[
            { key: "ALL", label: "Tất cả" },
            { key: "Passed", label: "Đã qua" },
            { key: "Studying", label: "Đang học" },
            { key: "Failed", label: "Đang nợ" },
            { key: "Available", label: "Đủ ĐK học" },
            { key: "Locked", label: "Bị khóa" },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilterState(f.key)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filterState === f.key
                  ? "bg-gradient-to-r from-[#0066b2] to-[#0284c7] text-white shadow"
                  : dark
                  ? "bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {f.label} ({counts[f.key] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* 9 Semester Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {Object.entries(semesters).map(([semNum, items]) => {
          const visible = items.filter((it) => {
            if (filterState !== "ALL" && it.state !== filterState) return false;
            if (searchQ.trim()) {
              const q = searchQ.trim().toLowerCase();
              if (
                !it.subject_code.toLowerCase().includes(q) &&
                !it.name.toLowerCase().includes(q)
              ) {
                return false;
              }
            }
            return true;
          });

          if (visible.length === 0) return null;

          return (
            <div
              key={semNum}
              className={`p-4 rounded-2xl border space-y-3 ${
                dark ? "bg-slate-900/65 border-slate-800/90" : "bg-white border-slate-200 shadow-xs"
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-500/15">
                <span className="font-display font-extrabold text-sm text-sky-400">
                  HỌC KỲ {semNum}
                </span>
                <span className="text-[11px] font-mono opacity-65">
                  {visible.reduce((s, x) => s + x.credits, 0)} tín chỉ
                </span>
              </div>

              <div className="space-y-2.5">
                {visible.map((subj) => {
                  const meta = STATE_META[subj.state] || STATE_META.Available;
                  const Icon = meta.icon;
                  return (
                    <button
                      key={subj.subject_code}
                      type="button"
                      onClick={() => setSelectedSubj({ ...subj, semester: semNum })}
                      className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${meta.card}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="font-mono font-extrabold text-xs">
                            {subj.subject_code}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {subj.grade != null && (
                            <span className="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-black/20">
                              {subj.grade.toFixed(1)}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                      </div>

                      <div className="text-xs font-medium mt-1 line-clamp-1">{subj.name}</div>

                      <div className="flex items-center justify-between text-[10.5px] opacity-75 mt-1.5 font-mono">
                        <span>{subj.credits} TC</span>
                        {subj.missing_prereqs?.length > 0 ? (
                          <span className="text-rose-400">
                            Thiếu: {subj.missing_prereqs.join(", ")}
                          </span>
                        ) : subj.unlocks?.length > 0 ? (
                          <span className="text-sky-400">
                            Mở khóa → {subj.unlocks.slice(0, 2).join(", ")}
                          </span>
                        ) : (
                          <span>Không chặn môn sau</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Subject Detail Modal */}
      {selectedSubj && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedSubj(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-md rounded-3xl border p-6 space-y-4 animate-fade-up ${
              dark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900 shadow-2xl"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-full bg-sky-500/15 text-sky-400">
                  Học kỳ {selectedSubj.semester} · {selectedSubj.credits} Tín chỉ
                </span>
                <h3 className="text-lg font-extrabold mt-2">
                  {selectedSubj.subject_code} — {selectedSubj.name}
                </h3>
              </div>
              <button
                onClick={() => setSelectedSubj(null)}
                className="p-1.5 rounded-xl hover:bg-slate-500/20 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-500/10">
                <div className="opacity-70">Trạng thái hiện tại</div>
                <div className="font-bold text-sm mt-0.5">
                  {STATE_META[selectedSubj.state]?.label || selectedSubj.state}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-500/10">
                <div className="opacity-70">Điểm tổng kết</div>
                <div className="font-mono font-extrabold text-sm mt-0.5 text-sky-400">
                  {selectedSubj.grade != null ? selectedSubj.grade.toFixed(1) : "Chưa có điểm"}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold uppercase tracking-wider opacity-75">
                Môn tiên quyết yêu cầu:
              </div>
              {selectedSubj.prerequisites?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedSubj.prerequisites.map((pr) => {
                    const missing = selectedSubj.missing_prereqs?.includes(pr);
                    return (
                      <span
                        key={pr}
                        className={`px-3 py-1 rounded-xl font-mono font-bold border ${
                          missing
                            ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                            : "bg-emerald-500/15 border-emerald-500/40 text-emerald-400"
                        }`}
                      >
                        {missing ? "❌" : "✅"} {pr}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <div className="opacity-70">Không yêu cầu môn tiên quyết.</div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-bold uppercase tracking-wider opacity-75">
                Môn kỳ sau phụ thuộc vào môn này:
              </div>
              {selectedSubj.unlocks?.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {selectedSubj.unlocks.map((u) => (
                    <span
                      key={u}
                      className="px-3 py-1 rounded-xl font-mono font-bold bg-sky-500/15 border border-sky-500/30 text-sky-400"
                    >
                      🔓 {u}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="opacity-70">Không chặn môn nào ở các kỳ tiếp theo.</div>
              )}
            </div>

            <button
              onClick={() => {
                const code = selectedSubj.subject_code;
                setSelectedSubj(null);
                onAskAiAbout(
                  `Tư vấn chi tiết điều kiện tiên quyết, trọng số thi Final Exam (FE) và chiến lược đạt điểm cao môn ${code}!`
                );
              }}
              className="w-full py-3 rounded-2xl font-bold text-xs sm:text-sm text-white bg-gradient-to-r from-[#0066b2] to-[#0db14b] hover:brightness-110 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageSquarePlus className="w-4 h-4" />
              <span>Hỏi AI Chiến lược Học & Thi môn {selectedSubj.subject_code}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
