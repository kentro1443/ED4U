"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlays";
import { Field, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { approveRoomRequestAction, rejectRoomRequestAction } from "./actions";

export function RoomApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const approve = () => {
    setError(null);
    startTransition(async () => {
      const response = await approveRoomRequestAction(requestId);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      router.refresh();
    });
  };

  const reject = () => {
    if (!reason.trim()) {
      setError("Hãy nhập lý do từ chối.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await rejectRoomRequestAction(requestId, reason);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setRejectOpen(false);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {error ? (
        <Alert tone="danger" title="Không thể xử lý">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => setRejectOpen(true)}
        >
          Từ chối
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={isPending} onClick={approve}>
          {isPending ? "Đang tái kiểm tra…" : "Duyệt & khóa phòng"}
        </Button>
      </div>
      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Từ chối yêu cầu phòng"
        description="Lý do sẽ được lưu và gửi lại cho học sinh."
      >
        <div className="space-y-4">
          <Field id={`reject-${requestId}`} label="Lý do" required>
            <Textarea
              id={`reject-${requestId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder="Ví dụ: Khung giờ trùng sự kiện ưu tiên của trường."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRejectOpen(false)}>
              Hủy
            </Button>
            <Button type="button" variant="danger" disabled={isPending} onClick={reject}>
              Xác nhận từ chối
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
