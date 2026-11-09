import React, { useEffect, useMemo, useRef, useState } from "react";
import { marked } from "marked";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  GraduationCap,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Wrench,
} from "lucide-react";
import { UniFsWordmark } from "./BrandMark";

marked.setOptions({
  breaks: true,
  gfm: true,
});

function renderMarkdownSafe(mdText) {
  if (!mdText) return { __html: "" };
  const sanitized = String(mdText)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\$\\ge(?:q)?\$/g, "≥")
    .replace(/\$\\le(?:q)?\$/g, "≤")
    .replace(/\$\\times\$/g, "×");
  return { __html: marked.parse(sanitized) };
}

const TOOL_LABELS = {
  get_student_profile: "Hồ sơ sinh viên",
  get_transcript: "Bảng điểm học vụ",
  calculate_gpa: "Tính GPA tích lũy",
  plan_target_gpa: "Hoạch định GPA mục tiêu",
  get_study_progress: "Tiến độ tín chỉ",
  check_prerequisites: "Kiểm tra môn tiên quyết",
  suggest_next_subjects: "Đề xuất môn kỳ tới",
  calculate_retake_fee: "Tính học phí học lại",
  check_attendance: "Kiểm tra tỷ lệ vắng",
  calculate_library_fine: "Tính phạt thư viện",
  search_policy: "Hybrid RAG Quy chế FPTU",
  get_student_schedule: "Thời khóa biểu FAP",
  get_attendance_details: "Điểm danh đa môn FAP",
  get_component_grades: "Bảng điểm thành phần FAP",
  get_fap_application_procedure: "Thủ tục đơn từ FAP",
  calculate_required_final_score: "Tính điểm sàn Final Exam (FE)",
  check_ojt_and_graduation_eligibility: "Xét điều kiện OJT & KLTN",
  simulate_semester_grades: "Giả lập GPA What-If",
  predict_graduation_forecast: "Dự báo tốt nghiệp AI",
};

export default function ChatStudio({
  dark,
  student,
  overview,
  messages,
  isStreaming,
  onSendPrompt,
}) {
  const [inputVal, setInputVal] = useState("");
  const [activeCategory, setActiveCategory] = useState("study");
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [expandedTools, setExpandedTools] = useState({});
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  const studyingCodes = useMemo(() => {
    const list = overview?.progress?.studying || [];
    if (list.length > 0) {
      return list
        .slice(0, 4)
        .map((s, idx) => `${s.subject_code} ${(8.2 - (idx % 2) * 0.6).toFixed(1)}`)
        .join(", ");
    }
    return "DPL302m 8.5, BDI302c 7.5, DSR301m 8.0, DWP301c 7.5";
  }, [overview]);

  const categories = useMemo(
    () => [
      {
        id: "study",
        title: "Học tập & Dự báo AI",
        desc: "Dự đoán năm tốt nghiệp, giả lập GPA, tính điểm thi FE",
        icon: GraduationCap,
        tone: "from-[#0066b2]/20 to-sky-500/5 border-[#0066b2]/40 text-sky-400",
        prompts: [
          `Giả sử kỳ này mình đạt ${studyingCodes} thì GPA học kỳ và GPA tích lũy mới là bao nhiêu?`,
          "Dự đoán xem năm nào mình tốt nghiệp và khi ra trường mình đạt bằng loại gì?",
          "Môn DPL302m điểm quá trình mình đang 6.5 thì thi Final Exam cần mấy điểm để qua môn?",
          "Thời khóa biểu tuần này và tình hình điểm danh của mình có nguy cơ cấm thi AF không?",
        ],
      },
      {
        id: "policy",
        title: "Quy chế & Thủ tục FAP",
        desc: "Đơn NVQS, bảo lưu, học phí học lại, kỷ luật phòng thi",
        icon: FileText,
        tone: "from-[#f37021]/20 to-amber-500/5 border-[#f37021]/40 text-orange-400",
        prompts: [
          "Mình đang nợ những môn nào và tổng tiền học phí học lại kỳ tới hết bao nhiêu?",
          "Hướng dẫn chi tiết cách nộp đơn xin giấy tạm hoãn nghĩa vụ quân sự (NVQS) trên FAP?",
          "Mình đã tích lũy đủ 90% tín chỉ để đi thực tập doanh nghiệp OJT202 kỳ 6 chưa?",
          "Quy định về cấm thi chuyên cần (vắng quá 20%) và đi muộn quá 5 phút tại FPTU?",
        ],
      },
      {
        id: "research",
        title: "Lộ trình & Khóa luận",
        desc: "Gợi ý môn kỳ tới, chuỗi tiên quyết, thưởng NCKH Scopus",
        icon: BookOpen,
        tone: "from-[#0db14b]/20 to-emerald-500/5 border-[#0db14b]/40 text-emerald-400",
        prompts: [
          "Kỳ tới mình nên đăng ký những môn nào và có môn nào đang bị chặn tiên quyết không?",
          "Điều kiện làm Khóa luận tốt nghiệp (AIP491) và quy trình bảo vệ Hội đồng tại FPTU?",
          "Mức thưởng công bố bài báo khoa học quốc tế ISI/Scopus (Q1, Q2, Q3, Q4) của trường?",
          "Để đạt bằng Giỏi (GPA 8.0) khi tốt nghiệp thì các tín chỉ còn lại mình cần trung bình mấy điểm?",
        ],
      },
      {
        id: "life",
        title: "Đời sống & Tiện ích",
        desc: "Phạt trễ sách thư viện, chuyển cơ sở, phúc khảo điểm",
        icon: HelpCircle,
        tone: "from-violet-500/20 to-indigo-500/5 border-violet-500/40 text-violet-400",
        prompts: [
          "Mượn sách thư viện trả trễ 12 ngày thì bị phạt bao nhiêu tiền?",
          "Thủ tục xin phúc khảo điểm thi cuối kỳ hoặc xin bảo lưu 1 học kỳ trên FAP?",
          "Quy định chuyển đổi môn Giáo dục thể chất hoặc chuyển cơ sở đào tạo FPTU?",
        ],
      },
    ],
    [studyingCodes]
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const q = inputVal.trim();
    if (!q || isStreaming) return;
    setInputVal("");
    onSendPrompt(q);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text || "");
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1800);
  };

  const gpaVal = overview?.gpa?.gpa;
  const gpaRank = overview?.gpa?.classification;
  const credPassed = overview?.progress?.credits_passed ?? 0;
  const credTotal = overview?.progress?.credits_total ?? 143;
  const att = overview?.attendance;

  return (
    <div className="flex flex-col h-full max-w-5xl mx-auto w-full">
      {/* Scrollable Chat Viewport */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-6">
        {messages.length === 0 ? (
          <div className="max-w-3xl mx-auto pt-2 sm:pt-5 space-y-6 animate-fade-up">
            {/* Hero Greeting */}
            <div className="text-center space-y-3">
              <div className="relative inline-block">
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-[#0066b2] via-[#f37021] to-[#0db14b] blur-2xl opacity-30" />
                <img
                  src="/assets/mascot_hero_clean.png"
                  alt="UniFs Mascot"
                  className="relative w-28 h-28 sm:w-34 sm:h-34 object-contain mx-auto animate-float"
                />
              </div>
              <div>
                <UniFsWordmark size="lg" dark={dark} />
                <h2 className="text-lg sm:text-xl font-bold mt-2">
                  Xin chào <span className="text-sky-400">{student?.full_name}</span>! Mình có thể giúp gì cho bạn hôm nay?
                </h2>
                <p className={`text-xs sm:text-sm mt-1 ${dark ? "text-slate-400" : "text-slate-600"}`}>
                  Mọi con số điểm, tín chỉ, học phí và dự báo đều được tính toán chính xác trực tiếp từ hồ sơ học vụ của bạn.
                </p>
              </div>

              {/* Quick Live Academic Status Strip */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                {!overview ? (
                  <span className="px-3.5 py-1 rounded-full text-xs font-semibold border border-sky-500/30 bg-sky-500/10 text-sky-400">
                    ⏳ Đang đồng bộ hồ sơ học vụ...
                  </span>
                ) : (
                  <>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        dark
                          ? "bg-slate-900/80 border-slate-800 text-sky-300"
                          : "bg-white border-slate-200 text-sky-700 shadow-xs"
                      }`}
                    >
                      📊 GPA: <b>{gpaVal != null ? `${gpaVal.toFixed(2)} (${gpaRank})` : "Chưa có"}</b>
                    </span>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        dark
                          ? "bg-slate-900/80 border-slate-800 text-emerald-300"
                          : "bg-white border-slate-200 text-emerald-700 shadow-xs"
                      }`}
                    >
                      🎓 Tín chỉ: <b>{credPassed}/{credTotal} TC</b>
                    </span>
                  </>
                )}
                {att?.subject_code && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                      att.is_attendance_fail
                        ? "bg-rose-500/15 border-rose-500/40 text-rose-400"
                        : att.remaining_allowed_absent <= 1
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                        : dark
                        ? "bg-slate-900/80 border-slate-800 text-slate-300"
                        : "bg-white border-slate-200 text-slate-700"
                    }`}
                  >
                    {att.is_attendance_fail
                      ? `🚨 Cấm thi AF: ${att.subject_code}`
                      : `📋 ${att.subject_code}: Vắng ${att.absent_slots}/${att.total_slots} buổi`}
                  </span>
                )}
              </div>
            </div>

            {/* 4 Interactive Bento Category Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map((cat) => {
                const Icon = cat.icon;
                const selected = activeCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setActiveCategory(cat.id)}
                    className={`text-left p-4 rounded-2xl border transition-all duration-200 cursor-pointer flex items-start gap-3.5 ${
                      selected
                        ? `bg-gradient-to-br ${cat.tone} shadow-lg scale-[1.01]`
                        : dark
                        ? "bg-slate-900/60 border-slate-800/90 hover:border-slate-700"
                        : "bg-white border-slate-200/90 hover:border-sky-300 shadow-xs"
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        selected
                          ? "bg-white/15"
                          : dark
                          ? "bg-slate-800 text-sky-400"
                          : "bg-slate-100 text-sky-600"
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm flex items-center justify-between">
                        <span>{cat.title}</span>
                        <ChevronRight
                          className={`w-4 h-4 transition-transform ${
                            selected ? "rotate-90" : "opacity-50"
                          }`}
                        />
                      </div>
                      <p className={`text-xs mt-0.5 line-clamp-1 ${dark ? "text-slate-400" : "text-slate-500"}`}>
                        {cat.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Dynamic Prompt Chips for Selected Category */}
            {activeCategory && (
              <div
                className={`p-4 rounded-2xl border space-y-2 animate-fade-up ${
                  dark ? "bg-slate-900/50 border-slate-800/80" : "bg-white/90 border-slate-200 shadow-xs"
                }`}
              >
                <div className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5 pb-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#f37021]" />
                  <span>Gợi ý câu hỏi thông minh (Bấm để hỏi ngay)</span>
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {categories
                    .find((c) => c.id === activeCategory)
                    ?.prompts.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSendPrompt(p)}
                        className={`text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-medium border transition flex items-center justify-between gap-3 cursor-pointer group ${
                          dark
                            ? "bg-slate-950/60 border-slate-800/80 hover:border-sky-500/50 hover:bg-slate-900 text-slate-200"
                            : "bg-slate-50 border-slate-200/80 hover:border-sky-400 hover:bg-sky-50/40 text-slate-700"
                        }`}
                      >
                        <span>{p}</span>
                        <Send className="w-3.5 h-3.5 shrink-0 opacity-40 group-hover:opacity-100 group-hover:text-sky-400 transition" />
                      </button>
                    ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Message List */
          <div className="space-y-5">
            {messages.map((m, idx) => {
              const isUser = m.role === "user";
              const tools = m.tools || [];
              const isToolOpen = !!expandedTools[idx];

              return (
                <div
                  key={idx}
                  className={`flex items-start gap-3 sm:gap-4 animate-fade-up ${
                    isUser ? "justify-end" : "justify-start"
                  }`}
                >
                  {!isUser && (
                    <img
                      src="/assets/mascot_avatar_clean.png"
                      alt="UniFs"
                      className="w-9 h-9 rounded-full border border-sky-500/40 bg-slate-900 object-cover shrink-0 mt-0.5 shadow-md"
                    />
                  )}

                  <div className={`max-w-[86%] sm:max-w-[78%] space-y-1.5 ${isUser ? "items-end" : "items-start"}`}>
                    <div
                      className={`rounded-2xl px-4 py-3 sm:px-5 sm:py-3.5 ${
                        isUser
                          ? "bg-gradient-to-br from-[#0066b2] to-[#0284c7] text-white rounded-tr-sm shadow-md shadow-sky-600/20"
                          : dark
                          ? "bg-slate-900/90 border border-slate-800 text-slate-100 rounded-tl-sm shadow-lg"
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-sm"
                      }`}
                    >
                      {isUser ? (
                        <div className="text-sm leading-relaxed whitespace-pre-wrap">{m.content}</div>
                      ) : m.content ? (
                        <div
                          className={`ai-markdown ${dark ? "" : "light-mode"}`}
                          dangerouslySetInnerHTML={renderMarkdownSafe(m.content)}
                        />
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-sky-400 py-1">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>UniFs đang truy vấn cơ sở dữ liệu học vụ & quy chế FPTU...</span>
                        </div>
                      )}
                    </div>

                    {/* Assistant Footer: Tool Call Badges & Copy */}
                    {!isUser && m.content && (
                      <div className="flex flex-wrap items-center gap-2 px-1">
                        {tools.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTools((prev) => ({ ...prev, [idx]: !prev[idx] }))
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
                              dark
                                ? "bg-sky-500/10 border-sky-500/30 text-sky-300 hover:bg-sky-500/20"
                                : "bg-sky-50 border-sky-200 text-sky-700 hover:bg-sky-100"
                            }`}
                          >
                            <Wrench className="w-3 h-3" />
                            <span>Đã tra cứu {tools.length} công cụ học vụ</span>
                            <ChevronDown
                              className={`w-3 h-3 transition-transform ${
                                isToolOpen ? "rotate-180" : ""
                              }`}
                            />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleCopy(m.content, idx)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] transition cursor-pointer ${
                            dark
                              ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800/70"
                              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                          }`}
                        >
                          {copiedIdx === idx ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Đã sao chép</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Sao chép</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Expanded Tool Calls Detail */}
                    {!isUser && isToolOpen && tools.length > 0 && (
                      <div
                        className={`p-3 rounded-xl border text-xs font-mono space-y-1.5 animate-fade-up ${
                          dark
                            ? "bg-slate-950/90 border-slate-800 text-slate-300"
                            : "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        {tools.map((t, ti) => (
                          <div key={ti} className="flex items-center justify-between gap-3">
                            <span className="text-sky-400 font-semibold">
                              ⚡ {TOOL_LABELS[t.tool] || t.tool}
                            </span>
                            <span className="opacity-65 truncate text-[11px]">
                              {t.tool}({t.args && Object.keys(t.args).length ? JSON.stringify(t.args) : ""})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {isUser && (
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#f37021] to-amber-500 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-md">
                      {student?.student_id?.slice(-2) || "SV"}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Bottom Sticky Chat Input Composer */}
      <div className="px-4 sm:px-6 pb-4 pt-2">
        <form
          onSubmit={handleSubmit}
          className={`flex items-end gap-2 p-2 rounded-2xl border shadow-xl transition ${
            dark
              ? "bg-slate-900/95 border-slate-700/80 focus-within:border-sky-500"
              : "bg-white border-slate-300 focus-within:border-sky-600"
          }`}
        >
          <textarea
            rows={1}
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder="Nhập câu hỏi cho UniFs (VD: Điểm quá trình DPL302m 7.0 cần thi FE mấy điểm? Hoặc dự báo năm tốt nghiệp...)"
            className="flex-1 bg-transparent px-3 py-2.5 text-sm outline-none resize-none max-h-32"
          />
          <button
            type="submit"
            disabled={!inputVal.trim() || isStreaming}
            className="p-3 rounded-xl bg-gradient-to-r from-[#0066b2] to-[#0db14b] text-white hover:brightness-110 disabled:opacity-40 transition shrink-0 shadow-md cursor-pointer"
            title="Gửi câu hỏi"
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
        <div className="text-center text-[11px] opacity-60 mt-2 flex items-center justify-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
          <span>UniFs Pro tính toán trực tiếp trên SQL Database · Không tự bịa số liệu học vụ</span>
        </div>
      </div>
    </div>
  );
}
