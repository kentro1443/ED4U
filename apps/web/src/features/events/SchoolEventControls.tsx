"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { ConfirmButton } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { createSchoolEventAction, deleteSchoolEventAction } from "./actions";

export function SchoolEventCreate({
  classes,
}: {
  classes: Array<{ id: string; code: string; grade: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [visibility, setVisibility] = useState("SCHOOL");
  const [error, setError] = useState<string | null>(null);
  const grades = [...new Set(classes.map((item) => item.grade))].sort();

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createSchoolEventAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };
  return (
    <form
      action={submit}
      className="grid gap-3 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 md:grid-cols-2 xl:grid-cols-4"
    >
      <div className="md:col-span-2 xl:col-span-4">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Tạo sự kiện trường</h2>
      </div>
      <Field id="school-event-title" label="Tên sự kiện" required>
        <Input id="school-event-title" name="title" required />
      </Field>
      <Field id="school-event-start" label="Bắt đầu" required>
        <Input id="school-event-start" name="startAt" type="datetime-local" required />
      </Field>
      <Field id="school-event-end" label="Kết thúc" required>
        <Input id="school-event-end" name="endAt" type="datetime-local" required />
      </Field>
      <Field id="school-event-vis" label="Hiển thị">
        <Select
          id="school-event-vis"
          name="visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="SCHOOL">Toàn trường</option>
          <option value="GRADE">Theo khối</option>
          <option value="CLASS">Theo lớp</option>
        </Select>
      </Field>
      {visibility === "GRADE" ? (
        <Field id="school-event-grade" label="Khối">
          <Select id="school-event-grade" name="grade">
            {grades.map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {visibility === "CLASS" ? (
        <Field id="school-event-class" label="Lớp">
          <Select id="school-event-class" name="classId">
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.code}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <div className="flex items-end">
        <Button type="submit" variant="primary" disabled={isPending}>
          {isPending ? "Đang tạo…" : "Tạo sự kiện"}
        </Button>
      </div>
      {error ? (
        <div className="md:col-span-2 xl:col-span-4">
          <Alert tone="danger" title="Không thể tạo sự kiện">
            {error}
          </Alert>
        </div>
      ) : null}
    </form>
  );
}

export function SchoolEventDelete({ eventId, title }: { eventId: string; title?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <ConfirmButton
        variant="secondary"
        confirmVariant="danger"
        size="sm"
        disabled={isPending}
        loading={isPending}
        title="Xóa sự kiện khỏi lịch trường?"
        consequence="Sự kiện sẽ biến mất khỏi lịch của mọi người trong phạm vi hiển thị. Thao tác không thể hoàn tác."
        details={title ? [{ label: "Sự kiện", value: title }] : undefined}
        confirmLabel="Xóa sự kiện"
        onConfirm={() =>
          startTransition(async () => {
            const result = await deleteSchoolEventAction(eventId);
            if (!result.ok) {
              setError(result.error);
              toast.error(result.error);
              return;
            }
            toast.success("Đã xóa sự kiện khỏi lịch trường.");
            router.refresh();
          })
        }
      >
        Xóa
      </ConfirmButton>
      {error ? <p className="mt-1 text-xs text-[var(--error)]">{error}</p> : null}
    </div>
  );
}
