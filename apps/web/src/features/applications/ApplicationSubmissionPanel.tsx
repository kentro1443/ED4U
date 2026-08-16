"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Field, Textarea } from "@/components/ui/Field";
import { Icons } from "@/components/ui/icons";
import { TEACHER_RESPONSIBILITY_LABELS } from "@/lib/teacher/routing";
import { submitApplicationAction, suggestTeachersAction } from "./actions";

type TeacherSuggestion =
  Awaited<ReturnType<typeof suggestTeachersAction>> extends infer R
    ? R extends { ok: true; teachers: infer T }
      ? T
      : never
    : never;

const SUBMISSION_FLASH_KEY = "ed4u:application-submission-success";

export function ApplicationSubmissionPanel() {
  const [isPending, startTransition] = useTransition();
  const [rawText, setRawText] = useState("");
  const [teachers, setTeachers] = useState<TeacherSuggestion>([] as unknown as TeacherSuggestion);
  const [selectedTeacher, setSelectedTeacher] = useState("");
  const [classification, setClassification] = useState<{
    category: string | null;
    confidence: string;
  } | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  useEffect(() => {
    const teacherName = sessionStorage.getItem(SUBMISSION_FLASH_KEY);
    if (!teacherName) return;
    sessionStorage.removeItem(SUBMISSION_FLASH_KEY);
    setMessage({ type: "success", text: `Đã nộp đơn và chuyển tới ${teacherName}.` });
  }, []);

  const suggest = () => {
    setMessage(null);
    startTransition(async () => {
      const response = await suggestTeachersAction(rawText);
      if (!response.ok) {
        setMessage({ type: "error", text: response.error });
        return;
      }
      setTeachers(response.teachers);
      setClassification(response.classification);
      setSelectedTeacher(response.teachers[0]?.teacherId ?? "");
    });
  };

  const submit = (formData: FormData) => {
    setMessage(null);
    formData.set("rawText", rawText);
    formData.set("teacherId", selectedTeacher);
    startTransition(async () => {
      const response = await submitApplicationAction(formData);
      if (!response.ok) {
        setMessage({ type: "error", text: response.error });
        return;
      }
      sessionStorage.setItem(SUBMISSION_FLASH_KEY, response.teacherName);
      window.location.reload();
    });
  };

  return (
    <Card>
      <CardHeader className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)]">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Nộp đơn mới</CardTitle>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Mô tả nhu cầu để ED4U phân loại trách nhiệm và xếp giáo viên theo tải công việc. Bạn
              luôn là người xác nhận giáo viên cuối cùng.
            </p>
          </div>
          <Badge tone="neutral">Routing deterministic</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-5">
        <Field id="application-need" label="Bạn cần nhà trường hỗ trợ việc gì?" required>
          <Textarea
            id="application-need"
            rows={3}
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            placeholder="Ví dụ: Em cần giấy xác nhận học sinh để hoàn thiện hồ sơ học bổng."
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={isPending || rawText.trim().length < 3}
            onClick={suggest}
          >
            <Icons.search className="mr-1.5 h-4 w-4" />
            Gợi ý giáo viên phụ trách
          </Button>
          <a
            href="/templates/ed4u-student-application-template.pdf"
            download
            className="inline-flex h-9 items-center rounded-lg border border-[var(--hairline)] px-3 text-xs font-semibold text-[var(--body)] hover:bg-[var(--surface-soft)]"
          >
            <Icons.download className="mr-1.5 h-4 w-4" />
            Tải mẫu PDF
          </a>
        </div>

        {classification ? (
          <Alert tone={classification.category ? "info" : "warning"} title="Kết quả phân loại">
            {classification.category
              ? `${TEACHER_RESPONSIBILITY_LABELS[classification.category] ?? classification.category} · độ chắc chắn ${classification.confidence.toLowerCase()}.`
              : "Nhu cầu chưa đủ rõ để phân loại; danh sách dưới đây chỉ xếp theo tải công việc. Bạn hãy chọn giáo viên thủ công."}
          </Alert>
        ) : null}

        {teachers.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teachers.map((teacher) => {
              const selected = selectedTeacher === teacher.teacherId;
              return (
                <button
                  key={teacher.teacherId}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedTeacher(teacher.teacherId)}
                  className={`rounded-xl border p-4 text-left transition-all ${selected ? "border-[var(--primary)] bg-[var(--surface-soft)] ring-1 ring-[var(--primary)]" : "border-[var(--hairline)] bg-[var(--canvas)] hover:border-[var(--muted)]"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{teacher.fullName}</p>
                      <p className="text-[11px] text-[var(--muted)]">{teacher.schoolMemberCode}</p>
                    </div>
                    <Badge tone={teacher.workloadScore >= 80 ? "success" : "neutral"}>
                      {teacher.workloadScore} tải
                    </Badge>
                  </div>
                  <p className="mt-3 text-xs text-[var(--body)]">{teacher.reasons.join(" ")}</p>
                </button>
              );
            })}
          </div>
        ) : null}

        {selectedTeacher ? (
          <form
            action={submit}
            className="space-y-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4"
          >
            <Field id="application-description" label="Ghi chú bổ sung">
              <Textarea
                id="application-description"
                name="description"
                rows={2}
                placeholder="Thông tin ngắn mà giáo viên cần biết trước khi mở PDF."
              />
            </Field>
            <Field
              id="application-file"
              label="PDF đã điền"
              description="Tối đa 10 MB. Hệ thống kiểm tra chữ ký PDF và lưu phiên bản bất biến."
              required
            >
              <input
                id="application-file"
                name="file"
                type="file"
                accept="application/pdf,.pdf"
                required
                className="block w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-2 text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[var(--primary)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--on-primary)]"
              />
            </Field>
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? "Đang nộp…" : "Nộp đơn & PDF phiên bản 1"}
            </Button>
          </form>
        ) : null}

        {message ? (
          <Alert
            tone={message.type === "error" ? "danger" : "success"}
            title={message.type === "error" ? "Không thể nộp đơn" : "Đã nộp đơn"}
          >
            {message.text}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
