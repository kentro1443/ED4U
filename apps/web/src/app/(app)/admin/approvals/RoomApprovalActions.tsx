"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Overlays";
import { Field, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import {
  approveRoomRequestAction,
  rejectRoomRequestAction,
  requestRoomChangesAction,
} from "./actions";

type DecisionMode = "reject" | "changes" | null;

export function RoomApprovalActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<DecisionMode>(null);
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

  const submitDecision = () => {
    if (!mode || !reason.trim()) {
      setError("Hãy nhập lý do trước khi tiếp tục.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const response =
        mode === "reject"
          ? await rejectRoomRequestAction(requestId, reason)
          : await requestRoomChangesAction(requestId, reason);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMode(null);
      setReason("");
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {error && mode === null ? (
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
          onClick={() => {
            setMode("changes");
            setReason("");
            setError(null);
          }}
        >
          Yêu cầu chỉnh sửa
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isPending}
          onClick={() => {
            setMode("reject");
            setReason("");
            setError(null);
          }}
        >
          Từ chối
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={isPending} onClick={approve}>
          {isPending ? "Đang tái kiểm tra…" : "Duyệt & khóa phòng"}
        </Button>
      </div>
      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open) setMode(null);
        }}
        title={mode === "changes" ? "Yêu cầu học sinh chỉnh sửa" : "Từ chối yêu cầu phòng"}
        description={
          mode === "changes"
            ? "Yêu cầu chuyển sang CHANGES_REQUESTED; học sinh có thể xem lý do và tạo phương án mới."
            : "Lý do sẽ được lưu, audit và gửi lại cho học sinh."
        }
      >
        <div className="space-y-4">
          <Field id={`room-decision-${requestId}`} label="Lý do" required>
            <Textarea
              id={`room-decision-${requestId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder={
                mode === "changes"
                  ? "Ví dụ: Hãy chọn khung giờ sau 16:30 để tránh lịch hoạt động của trường."
                  : "Ví dụ: Phòng được ưu tiên cho kỳ thi của trường trong khung giờ này."
              }
            />
          </Field>
          {error ? (
            <Alert tone="danger" title="Không thể xử lý">
              {error}
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant={mode === "reject" ? "danger" : "primary"}
              disabled={isPending}
              onClick={submitDecision}
            >
              {mode === "changes" ? "Gửi yêu cầu chỉnh sửa" : "Xác nhận từ chối"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
