"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { Field, Select, Textarea } from "@/components/ui/Field";
import {
  requestApplicationTransferAction,
  respondApplicationTransferAction,
  reviewApplicationAction,
  submitApplicationVersionAction,
} from "./actions";

export function ApplicationVersionUpload({ applicationId }: { applicationId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const submit = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const response = await submitApplicationVersionAction(applicationId, formData);
      if (!response.ok) {
        setMessage(response.error);
        return;
      }
      router.refresh();
    });
  };
  return (
    <form
      action={submit}
      className="mt-3 space-y-2 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3"
    >
      <p className="text-xs font-semibold text-[var(--ink)]">Nộp phiên bản PDF bổ sung</p>
      <input
        name="file"
        type="file"
        accept="application/pdf,.pdf"
        required
        className="block w-full text-xs"
      />
      <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
        {isPending ? "Đang tải…" : "Nộp phiên bản mới"}
      </Button>
      {message ? <p className="text-xs text-[var(--danger)]">{message}</p> : null}
    </form>
  );
}

export function ApplicationReviewActions({
  applicationId,
  status,
  teachers,
}: {
  applicationId: string;
  status: string;
  teachers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [targetTeacher, setTargetTeacher] = useState(teachers[0]?.id ?? "");
  const [transferReason, setTransferReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const review = (to: "IN_REVIEW" | "NEEDS_MORE_INFO" | "APPROVED" | "REJECTED") => {
    setError(null);
    startTransition(async () => {
      const response = await reviewApplicationAction({ applicationId, to, note });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNote("");
      router.refresh();
    });
  };

  const transfer = () => {
    if (!targetTeacher || !transferReason.trim()) {
      setError("Hãy chọn giáo viên và ghi lý do chuyển đơn.");
      return;
    }
    startTransition(async () => {
      const response = await requestApplicationTransferAction({
        applicationId,
        targetTeacherId: targetTeacher,
        reason: transferReason,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setTransferReason("");
      router.refresh();
    });
  };

  const canReview = ["SUBMITTED", "IN_REVIEW"].includes(status);
  return (
    <div className="mt-4 space-y-3 border-t border-[var(--hairline-soft)] pt-4">
      {error ? (
        <Alert tone="danger" title="Không thể xử lý">
          {error}
        </Alert>
      ) : null}
      {canReview ? (
        <>
          <Field id={`review-note-${applicationId}`} label="Phản hồi cho học sinh">
            <Textarea
              id={`review-note-${applicationId}`}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Bắt buộc khi yêu cầu bổ sung hoặc từ chối."
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {status === "SUBMITTED" ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={isPending}
                onClick={() => review("IN_REVIEW")}
              >
                Bắt đầu review
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => review("NEEDS_MORE_INFO")}
            >
              Yêu cầu bổ sung
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isPending}
              onClick={() => review("APPROVED")}
            >
              Duyệt
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={isPending}
              onClick={() => review("REJECTED")}
            >
              Từ chối
            </Button>
          </div>
        </>
      ) : null}

      {teachers.length > 0 ? (
        <details className="rounded-lg border border-[var(--hairline)] p-3">
          <summary className="cursor-pointer text-xs font-semibold text-[var(--ink)]">
            Chuyển đơn sang giáo viên khác
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
            <Field id={`transfer-teacher-${applicationId}`} label="Giáo viên nhận">
              <Select
                id={`transfer-teacher-${applicationId}`}
                value={targetTeacher}
                onChange={(event) => setTargetTeacher(event.target.value)}
              >
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id={`transfer-reason-${applicationId}`} label="Lý do">
              <Textarea
                id={`transfer-reason-${applicationId}`}
                rows={1}
                value={transferReason}
                onChange={(event) => setTransferReason(event.target.value)}
              />
            </Field>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={transfer}
            >
              Gửi yêu cầu chuyển
            </Button>
          </div>
          <p className="mt-2 text-[11px] text-[var(--muted)]">
            Giáo viên hiện tại vẫn phụ trách cho tới khi người nhận chấp nhận.
          </p>
        </details>
      ) : null}
    </div>
  );
}

export function ApplicationTransferResponse({
  applicationId,
  reason,
}: {
  applicationId: string;
  reason?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const respond = (accept: boolean) => {
    setError(null);
    startTransition(async () => {
      const response = await respondApplicationTransferAction(applicationId, accept);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      router.refresh();
    });
  };
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs font-semibold text-amber-950">Bạn được mời nhận đơn này</p>
      {reason ? <p className="mt-1 text-xs text-amber-900">{reason}</p> : null}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={isPending}
          onClick={() => respond(true)}
        >
          Nhận đơn
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => respond(false)}
        >
          Từ chối nhận
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
