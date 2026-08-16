"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/components/ui/ConfirmDialog";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import { cancelRoomRequestAction } from "./actions";

export function RoomRequestActions({
  requestId,
  status,
  roomLabel,
  slotLabel,
}: {
  requestId: string;
  status: string;
  roomLabel?: string;
  slotLabel?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canCancel = ["PENDING_APPROVAL", "CHANGES_REQUESTED", "APPROVED"].includes(status);
  const wasApproved = status === "APPROVED";

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelRoomRequestAction(requestId);
      if (!result.ok) {
        setError(result.error);
        toast.error(result.error);
        return;
      }
      toast.success(
        wasApproved ? "Đã hủy booking và giải phóng phòng." : "Đã hủy yêu cầu đặt phòng.",
      );
      router.refresh();
    });
  };

  const details = [
    ...(roomLabel ? [{ label: "Phòng", value: roomLabel }] : []),
    ...(slotLabel ? [{ label: "Thời gian", value: slotLabel }] : []),
  ];

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "CHANGES_REQUESTED" ? (
          <Link
            href="/rooms"
            className="inline-flex h-9 items-center rounded-md border border-[var(--hairline)] px-3 text-xs font-semibold transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Tạo phương án mới
          </Link>
        ) : null}
        {canCancel ? (
          <ConfirmButton
            variant="secondary"
            confirmVariant="danger"
            size="sm"
            disabled={isPending}
            loading={isPending}
            onConfirm={cancel}
            title={wasApproved ? "Hủy booking đã được duyệt?" : "Hủy yêu cầu đặt phòng?"}
            consequence={
              wasApproved
                ? "Phòng sẽ được giải phóng ngay và người khác có thể đặt vào khung giờ này. Thao tác không thể hoàn tác."
                : "Yêu cầu sẽ bị hủy và soft hold được giải phóng. Bạn có thể tạo yêu cầu mới sau."
            }
            details={details.length > 0 ? details : undefined}
            confirmLabel={wasApproved ? "Hủy booking" : "Hủy yêu cầu"}
          >
            {wasApproved ? "Hủy booking" : "Hủy yêu cầu"}
          </ConfirmButton>
        ) : null}
      </div>
      {error ? (
        <Alert tone="danger" title="Không thể hủy">
          {error}
        </Alert>
      ) : null}
    </div>
  );
}
