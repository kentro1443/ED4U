"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Drawer } from "@/components/ui/Overlays";
import { Field, Input, Select, Switch } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { parsePromptAction, createMentorMatchRunAction } from "./actions";
import type { ParsedStudentRequestDTO } from "@/lib/mentor/parser";
import type { Domain, Skill, TeachingStyle, StudentRequest } from "@ed4u/mentor-engine";

const SAMPLE_PROMPT_CHIPS = [
  {
    label: "IELTS Writing",
    prompt:
      "Em IELTS khoảng 6.0, Writing yếu, muốn lên 7.0. Em rảnh tối thứ 3 và thứ 5, ngân sách khoảng 250k/giờ. Em thích mentor dạy có cấu trúc.",
  },
  {
    label: "SAT Math",
    prompt:
      "Cần tìm mentor SAT Math, target 1450, rảnh chiều thứ 6, ngân sách tối đa 400k/giờ, chỉ mentor đã xác minh.",
  },
  {
    label: "HSK 5 Luyện thi",
    prompt: "Em muốn học HSK 3 lên 5, rảnh tối thứ 2 và thứ 4, ngân sách 200k/giờ.",
  },
  {
    label: "Hồ sơ du học & Speaking",
    prompt:
      "Cần mentor luyện IELTS Speaking 7.5 và sửa bài luận du học, rảnh cuối tuần thứ 7 và CN.",
  },
  {
    label: "Ngân sách tiết kiệm",
    prompt: "Tìm mentor IELTS Speaking với ngân sách dưới 200k/giờ, dạy nhiệt tình.",
  },
  {
    label: "Học tối các ngày trong tuần",
    prompt:
      "Em rảnh các buổi tối T2, T3, T4 sau 19h, cần luyện IELTS 6.5 lên 7.5, ngân sách 300k/giờ.",
  },
];

const DOMAIN_SKILLS: Record<Domain, { value: Skill; label: string }[]> = {
  IELTS: [
    { value: "IELTS.WRITING", label: "Writing" },
    { value: "IELTS.SPEAKING", label: "Speaking" },
    { value: "IELTS.READING", label: "Reading" },
    { value: "IELTS.LISTENING", label: "Listening" },
  ],
  SAT: [
    { value: "SAT.MATH", label: "SAT Math" },
    { value: "SAT.READING_WRITING", label: "SAT Reading & Writing" },
  ],
  HSK: [
    { value: "HSK.WRITING", label: "Viết HSK" },
    { value: "HSK.READING", label: "Đọc HSK" },
    { value: "HSK.LISTENING", label: "Nghe HSK" },
  ],
};

const TEACHING_STYLE_OPTIONS: { value: TeachingStyle; label: string }[] = [
  { value: "STRUCTURED", label: "Có cấu trúc (Structured)" },
  { value: "EXAM_FOCUSED", label: "Luyện đề / Thực hành (Exam-Focused)" },
  { value: "FLEXIBLE", label: "Linh hoạt (Flexible)" },
  { value: "MOTIVATING", label: "Truyền cảm hứng (Motivating)" },
];

const WEEKDAY_OPTIONS = [
  { key: "MON", label: "Thứ 2" },
  { key: "TUE", label: "Thứ 3" },
  { key: "WED", label: "Thứ 4" },
  { key: "THU", label: "Thứ 5" },
  { key: "FRI", label: "Thứ 6" },
  { key: "SAT", label: "Thứ 7" },
  { key: "SUN", label: "Chủ Nhật" },
];

export function MentorSearchComposer() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Confirmation Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedStudentRequestDTO | null>(null);

  // Editable constraints in confirmation
  const [domain, setDomain] = useState<Domain>("IELTS");
  const [currentScore, setCurrentScore] = useState<string>("");
  const [targetScore, setTargetScore] = useState<string>("");
  const [focusSkills, setFocusSkills] = useState<Skill[]>([]);
  const [maxBudget, setMaxBudget] = useState<string>("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [timePeriod, setTimePeriod] = useState<"evening" | "afternoon" | "morning">("evening");
  const [teachingStyles, setTeachingStyles] = useState<TeachingStyle[]>([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const handleParse = async (textToParse?: string) => {
    const query = (textToParse ?? prompt).trim();
    if (!query) {
      setError("Vui lòng nhập nhu cầu học tập của bạn.");
      return;
    }
    setError(null);
    setIsParsing(true);

    const res = await parsePromptAction(query);
    setIsParsing(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    const data = res.data;
    setParsedData(data);
    setDomain(data.domain ?? "IELTS");
    setCurrentScore(data.currentScore !== undefined ? String(data.currentScore) : "");
    setTargetScore(data.targetScore !== undefined ? String(data.targetScore) : "");
    setFocusSkills(data.focusSkills);
    setMaxBudget(data.maxPricePerHour !== undefined ? String(data.maxPricePerHour) : "");
    setVerifiedOnly(data.verifiedOnly);
    setTeachingStyles(data.teachingStyles);

    // Extract days
    const extractedDays = Array.from(new Set(data.availability.map((s) => s.slice(0, 3))));
    setSelectedDays(extractedDays);

    setIsDrawerOpen(true);
  };

  const handleExecuteRun = async () => {
    setIsExecuting(true);
    setError(null);

    // Reconstruct availability slots from selected days and period
    const slotsMap = {
      evening: ["19_00", "20_00"],
      afternoon: ["14_00", "15_00"],
      morning: ["08_00", "09_00"],
    };
    const slots = slotsMap[timePeriod];
    const availability = selectedDays.flatMap((day) => slots.map((s) => `${day}_${s}`));

    const canonicalRequest: StudentRequest = {
      requestId: `req_${Date.now()}`,
      goal: {
        domain,
        ...(currentScore ? { currentScore: Number(currentScore) } : {}),
        ...(targetScore ? { targetScore: Number(targetScore) } : {}),
        focusSkills: focusSkills.filter((s) => s.startsWith(domain)),
      },
      hardConstraints: {
        verifiedOnly,
        ...(maxBudget ? { maxPricePerHour: Number(maxBudget) } : {}),
        requiredExpertise: [],
        requireAllAvailability: false,
      },
      availability,
      softPreferences: {
        teachingStyles,
        languages: ["VI"],
      },
      additionalPreferences: parsedData?.unhandledFragments ?? [],
    };

    const res = await createMentorMatchRunAction({
      rawText: prompt || parsedData?.rawText || "Yêu cầu tùy chỉnh",
      canonicalRequest,
    });

    setIsExecuting(false);

    if (!res.ok) {
      setError(res.error);
      return;
    }

    setIsDrawerOpen(false);
    router.push(`/mentor/match-space?run=${res.runId}`);
  };

  const toggleSkill = (skill: Skill) => {
    setFocusSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const toggleStyle = (style: TeachingStyle) => {
    setTeachingStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style],
    );
  };

  return (
    <div className="space-y-4">
      <Card className="p-5 md:p-6 bg-[var(--canvas)] border-[var(--hairline)] shadow-sm">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label
              htmlFor="mentor-prompt"
              className="text-sm font-semibold text-[var(--ink)] flex items-center gap-2"
            >
              <Icons.search className="h-4 w-4 text-[var(--primary)]" />
              Bạn đang muốn cải thiện mục tiêu gì?
            </label>
            <span className="text-xs text-[var(--muted)]">Phân tích ngôn ngữ tự nhiên V1</span>
          </div>

          <textarea
            id="mentor-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] focus:bg-[var(--canvas)] focus:border-[var(--primary)] focus:outline-none transition-colors leading-relaxed"
            placeholder="Ví dụ: Em IELTS khoảng 6.0, Writing yếu, muốn lên 7.0. Em rảnh tối thứ 3 và thứ 5, ngân sách khoảng 250k/giờ. Em thích mentor dạy có cấu trúc."
          />

          {error && (
            <Alert tone="danger" title="Không thể tìm kiếm">
              {error}
            </Alert>
          )}

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-[var(--muted)] mr-1">Gợi ý mẫu:</span>
              {SAMPLE_PROMPT_CHIPS.slice(0, 4).map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => {
                    setPrompt(chip.prompt);
                    handleParse(chip.prompt);
                  }}
                  className="rounded-full border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1 text-xs text-[var(--body)] hover:border-[var(--primary)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              variant="primary"
              size="md"
              loading={isParsing}
              onClick={() => handleParse()}
              className="w-full sm:w-auto shrink-0 shadow-sm"
            >
              <Icons.mentor className="h-4 w-4 mr-1.5" />
              Tìm mentor phù hợp
            </Button>
          </div>
        </div>
      </Card>

      {/* Confirmation & Constraint Tuning Drawer / Sheet */}
      <Drawer
        open={isDrawerOpen}
        onOpenChange={setIsDrawerOpen}
        side="right"
        title="Xác nhận & Tùy chỉnh tiêu chí tìm kiếm"
        description="Kiểm tra các tiêu chí đã được trích xuất trước khi chạy thuật toán Mentor Engine."
      >
        <div className="space-y-6 pt-4 pb-8 overflow-y-auto">
          {parsedData?.parserNotes && parsedData.parserNotes.length > 0 && (
            <Alert tone="warning" title="Lưu ý từ bộ phân tích">
              {parsedData.parserNotes.join(" ")}
            </Alert>
          )}

          {/* 1. Goal Domain & Scores */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              1. Mục tiêu chứng chỉ & Điểm số
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field id="domain" label="Môn / Chứng chỉ" required>
                <Select
                  name="domain"
                  value={domain}
                  onChange={(e) => {
                    const newDomain = e.target.value as Domain;
                    setDomain(newDomain);
                    setFocusSkills([]);
                  }}
                >
                  <option value="IELTS">IELTS</option>
                  <option value="SAT">SAT</option>
                  <option value="HSK">HSK (Tiếng Trung)</option>
                </Select>
              </Field>

              <Field id="currentScore" label="Điểm hiện tại">
                <Input
                  type="number"
                  step={domain === "IELTS" ? "0.5" : "10"}
                  value={currentScore}
                  onChange={(e) => setCurrentScore(e.target.value)}
                  placeholder={domain === "IELTS" ? "6.0" : domain === "SAT" ? "1200" : "3"}
                />
              </Field>

              <Field id="targetScore" label="Điểm mục tiêu">
                <Input
                  type="number"
                  step={domain === "IELTS" ? "0.5" : "10"}
                  value={targetScore}
                  onChange={(e) => setTargetScore(e.target.value)}
                  placeholder={domain === "IELTS" ? "7.0" : domain === "SAT" ? "1450" : "5"}
                />
              </Field>
            </div>
          </div>

          {/* 2. Focus Skills */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              2. Kỹ năng trọng tâm
            </h3>
            <div className="flex flex-wrap gap-2">
              {DOMAIN_SKILLS[domain].map((sk) => {
                const active = focusSkills.includes(sk.value);
                return (
                  <button
                    key={sk.value}
                    type="button"
                    onClick={() => toggleSkill(sk.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)]"
                        : "bg-[var(--surface-soft)] text-[var(--body)] border-[var(--hairline)] hover:border-[var(--primary)]"
                    }`}
                  >
                    {sk.label} {active && "✓"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Budget Hard Constraint */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              3. Ngân sách học phí (Ràng buộc cứng)
            </h3>
            <Field
              id="maxBudget"
              label="Học phí tối đa (VNĐ / giờ)"
              description="Mentor có giá vượt quá mức này sẽ bị loại trừ tuyệt đối."
            >
              <Input
                type="number"
                step="50000"
                value={maxBudget}
                onChange={(e) => setMaxBudget(e.target.value)}
                placeholder="Ví dụ: 300000"
              />
            </Field>
          </div>

          {/* 4. Availability Days & Times */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              4. Thời gian học rảnh trong tuần
            </h3>

            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_OPTIONS.map((d) => {
                const active = selectedDays.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => toggleDay(d.key)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)]"
                        : "bg-[var(--surface-soft)] text-[var(--body)] border-[var(--hairline)]"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-4 pt-1">
              <label className="text-xs text-[var(--muted)] font-medium">Khung giờ:</label>
              {(
                [
                  { id: "evening", label: "Buổi tối (19:00 - 21:00)" },
                  { id: "afternoon", label: "Buổi chiều (14:00 - 16:00)" },
                  { id: "morning", label: "Buổi sáng (08:00 - 10:00)" },
                ] as const
              ).map((p) => (
                <label
                  key={p.id}
                  className="inline-flex items-center gap-1.5 text-xs text-[var(--body)] cursor-pointer"
                >
                  <input
                    type="radio"
                    name="timePeriod"
                    value={p.id}
                    checked={timePeriod === p.id}
                    onChange={() => setTimePeriod(p.id)}
                    className="accent-[var(--primary)]"
                  />
                  {p.label}
                </label>
              ))}
            </div>
          </div>

          {/* 5. Teaching Styles */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              5. Phong cách giảng dạy ưu tiên
            </h3>
            <div className="flex flex-wrap gap-2">
              {TEACHING_STYLE_OPTIONS.map((st) => {
                const active = teachingStyles.includes(st.value);
                return (
                  <button
                    key={st.value}
                    type="button"
                    onClick={() => toggleStyle(st.value)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors cursor-pointer ${
                      active
                        ? "bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)]"
                        : "bg-[var(--surface-soft)] text-[var(--body)] border-[var(--hairline)]"
                    }`}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. Verified Only */}
          <div className="flex items-center justify-between rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3.5">
            <div>
              <span className="text-sm font-semibold text-[var(--ink)] block">
                Chỉ chọn mentor đã xác minh chứng chỉ
              </span>
              <span className="text-xs text-[var(--muted)]">
                Bỏ qua những mentor chưa được nhà trường duyệt bằng cấp.
              </span>
            </div>
            <Switch
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
              label="Chỉ chọn mentor đã xác minh"
            />
          </div>

          {/* CTA Footer */}
          <div className="pt-4 border-t border-[var(--hairline)] flex items-center justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => setIsDrawerOpen(false)}
            >
              Hủy bỏ
            </Button>
            <Button
              type="button"
              variant="primary"
              size="md"
              loading={isExecuting}
              onClick={handleExecuteRun}
            >
              <Icons.matchSpace className="h-4 w-4 mr-1.5" />
              Chạy Mentor Engine & Mở Match Space
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}
