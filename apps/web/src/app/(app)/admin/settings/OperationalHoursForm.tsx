"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { updateOperationalHoursAction } from "./actions";

export function OperationalHoursForm({
  startTime,
  endTime,
  timezone,
}: {
  startTime: string;
  endTime: string;
  timezone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateOperationalHoursAction(formData);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success("Đã lưu khung giờ hoạt động.");
      router.refresh();
    });
  }

  return (
    <form action={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="settings-start"
          label="Giờ mở cửa"
          required
          description={`Giờ dân dụng theo múi giờ ${timezone}.`}
        >
          <Input
            id="settings-start"
            name="startTime"
            type="time"
            defaultValue={startTime}
            required
          />
        </Field>
        <Field
          id="settings-end"
          label="Giờ đóng cửa"
          required
          description="Yêu cầu đặt phòng ngoài khung giờ này sẽ bị Facility Engine từ chối."
        >
          <Input id="settings-end" name="endTime" type="time" defaultValue={endTime} required />
        </Field>
      </div>

      {error && (
        <Alert tone="danger" title="Không thể lưu cài đặt">
          {error}
        </Alert>
      )}

      <div className="flex justify-end">
        <Button type="submit" loading={pending}>
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}
