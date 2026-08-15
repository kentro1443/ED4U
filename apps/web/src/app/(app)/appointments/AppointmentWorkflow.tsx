"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { suggestTeachersAction } from "@/features/applications/actions";
import {
  createAppointmentAction,
  sendAppointmentMessageAction,
  studentRespondRescheduleAction,
  teacherRespondAppointmentAction,
} from "./actions";

export function AppointmentCreatePanel() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [need, setNeed] = useState("");
  const [teachers, setTeachers] = useState<
    Array<{ teacherId: string; fullName: string; workloadScore: number; reasons: string[] }>
  >([]);
  const [teacherId, setTeacherId] = useState("");
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const suggest = () => {
    startTransition(async () => {
      const response = await suggestTeachersAction(need);
      if (!response.ok) {
        setMessage({ type: "error", text: response.error });
        return;
      }
      setTeachers(response.teachers);
      setTeacherId(response.teachers[0]?.teacherId ?? "");
      setMessage(null);
    });
  };

  const create = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const response = await createAppointmentAction({
        teacherId,
        title: String(formData.get("title") ?? need),
        date: String(formData.get("date") ?? ""),
        start: String(formData.get("start") ?? ""),
        end: String(formData.get("end") ?? ""),
      });
      if (!response.ok) {
        setMessage({ type: "error", text: response.error });
        return;
      }
      setMessage({ type: "success", text: `Đã gửi yêu cầu lịch hẹn tới ${response.teacherName}.` });
      router.refresh();
    });
  };

  return (
    <Card>
      <CardHeader className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)]">
        <CardTitle>Đặt lịch với giáo viên</CardTitle>
        <p className="text-xs text-[var(--muted)]">
          Mô tả nhu cầu → ED4U lọc theo trách nhiệm và tải → bạn chọn giáo viên và khung giờ. Giáo
          viên có thể chấp nhận, từ chối hoặc đề xuất giờ khác.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">
        <Field id="appointment-need" label="Bạn muốn trao đổi việc gì?" required>
          <Textarea
            id="appointment-need"
            rows={2}
            value={need}
            onChange={(event) => setNeed(event.target.value)}
            placeholder="Ví dụ: Em muốn trao đổi về chọn ngành đại học và kế hoạch hồ sơ."
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending || need.trim().length < 3}
          onClick={suggest}
        >
          Gợi ý giáo viên
        </Button>

        {teachers.length > 0 ? (
          <div className="grid gap-2 md:grid-cols-3">
            {teachers.slice(0, 5).map((teacher) => (
              <button
                key={teacher.teacherId}
                type="button"
                aria-pressed={teacherId === teacher.teacherId}
                onClick={() => setTeacherId(teacher.teacherId)}
                className={`rounded-lg border p-3 text-left ${teacherId === teacher.teacherId ? "border-[var(--primary)] bg-[var(--surface-soft)] ring-1 ring-[var(--primary)]" : "border-[var(--hairline)]"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-[var(--ink)]">
                    {teacher.fullName}
                  </span>
                  <Badge tone="neutral">{teacher.workloadScore}</Badge>
                </div>
                <p className="mt-2 text-[11px] text-[var(--muted)]">{teacher.reasons.join(" ")}</p>
              </button>
            ))}
          </div>
        ) : null}

        {teacherId ? (
          <form
            action={create}
            className="grid gap-3 rounded-xl border border-[var(--hairline)] p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="sm:col-span-2 lg:col-span-4">
              <Field id="appointment-title" label="Tiêu đề">
                <Input id="appointment-title" name="title" defaultValue={need} maxLength={160} />
              </Field>
            </div>
            <Field id="appointment-date" label="Ngày" required>
              <Input id="appointment-date" name="date" type="date" required />
            </Field>
            <Field id="appointment-start" label="Bắt đầu" required>
              <Input id="appointment-start" name="start" type="time" required />
            </Field>
            <Field id="appointment-end" label="Kết thúc" required>
              <Input id="appointment-end" name="end" type="time" required />
            </Field>
            <div className="flex items-end">
              <Button type="submit" variant="primary" className="w-full" disabled={isPending}>
                Gửi yêu cầu
              </Button>
            </div>
          </form>
        ) : null}
        {message ? (
          <Alert
            tone={message.type === "error" ? "danger" : "success"}
            title={message.type === "error" ? "Không thể tạo lịch" : "Đã gửi yêu cầu"}
          >
            {message.text}
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function TeacherAppointmentActions({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const respond = (action: "DECLINE" | "PROPOSE", formData?: FormData) => {
    startTransition(async () => {
      const response = await teacherRespondAppointmentAction({
        appointmentId,
        action,
        note,
        date: String(formData?.get("date") ?? ""),
        start: String(formData?.get("start") ?? ""),
        end: String(formData?.get("end") ?? ""),
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  };

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--hairline-soft)] pt-3">
      <Field id={`appointment-note-${appointmentId}`} label="Phản hồi / lý do">
        <Textarea
          id={`appointment-note-${appointmentId}`}
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={isPending}
          onClick={() => respond("DECLINE")}
        >
          Từ chối
        </Button>
      </div>
      <details className="rounded-lg border border-[var(--hairline)] p-3">
        <summary className="cursor-pointer text-xs font-semibold">Đề xuất khung giờ khác</summary>
        <form
          action={(formData) => respond("PROPOSE", formData)}
          className="mt-3 grid gap-2 sm:grid-cols-4"
        >
          <Input name="date" type="date" required aria-label="Ngày đề xuất" />
          <Input name="start" type="time" required aria-label="Giờ bắt đầu đề xuất" />
          <Input name="end" type="time" required aria-label="Giờ kết thúc đề xuất" />
          <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
            Gửi đề xuất
          </Button>
        </form>
      </details>
      {error ? <p className="text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function StudentRescheduleActions({ appointmentId }: { appointmentId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const respond = (accept: boolean) =>
    startTransition(async () => {
      const response = await studentRespondRescheduleAction(appointmentId, accept);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      router.refresh();
    });
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={isPending}
        onClick={() => respond(true)}
      >
        Chấp nhận giờ mới
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={isPending}
        onClick={() => respond(false)}
      >
        Không phù hợp
      </Button>
      {error ? <p className="w-full text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}

export function AppointmentConversation({
  appointmentId,
  messages,
}: {
  appointmentId: string;
  messages: Array<{
    id: string;
    senderName: string;
    body: string;
    createdAt: string;
    mine: boolean;
  }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const send = () =>
    startTransition(async () => {
      const response = await sendAppointmentMessageAction(appointmentId, body);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setBody("");
      setError(null);
      router.refresh();
    });
  return (
    <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
      <p className="text-xs font-semibold text-[var(--ink)]">Trao đổi trong lịch hẹn</p>
      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-xs text-[var(--muted)]">Chưa có tin nhắn.</p>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${message.mine ? "ml-auto bg-[var(--primary)] text-[var(--on-primary)]" : "bg-[var(--canvas)] text-[var(--body)]"}`}
            >
              <p className="mb-1 text-[10px] opacity-70">
                {message.senderName} · {message.createdAt}
              </p>
              <p>{message.body}</p>
            </div>
          ))
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <Input
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Nhập tin nhắn…"
          aria-label="Tin nhắn lịch hẹn"
        />
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={isPending || !body.trim()}
          onClick={send}
        >
          Gửi
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
