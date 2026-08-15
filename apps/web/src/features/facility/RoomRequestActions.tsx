"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Feedback";
import { cancelRoomRequestAction } from "./actions";

export function RoomRequestActions({ requestId, status }: { requestId: string; status: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const canCancel = ["PENDING_APPROVAL", "CHANGES_REQUESTED", "APPROVED"].includes(status);

  const cancel = () => {
    if (
      !window.confirm(
        status === "APPROVED"
          ? "Hủy booking đã được duyệt và giải phóng phòng?"
          : "Hủy yêu cầu phòng này?",
      )
    )
      return;
    setError(null);
    startTransition(async () => {
      const result = await cancelRoomRequestAction(requestId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "CHANGES_REQUESTED" ? (
          <Link
            href="/rooms"
            className="inline-flex h-8 items-center rounded-md border border-[var(--hairline)] px-3 text-xs font-semibold hover:bg-[var(--surface-soft)]"
          >
            Tạo phương án mới
          </Link>
        ) : null}
        {canCancel ? (
          <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={cancel}>
            {status === "APPROVED" ? "Hủy booking" : "Hủy yêu cầu"}
          </Button>
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
