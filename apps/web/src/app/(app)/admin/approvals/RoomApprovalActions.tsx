"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Overlays";
import { Field, Textarea } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { useToast } from "@/components/ui/Toast";
import {
  approveRoomRequestAction,
  rejectRoomRequestAction,
  requestRoomChangesAction,
} from "./actions";

type DecisionMode = "reject" | "changes" | null;

export interface ApprovalSummary {
  room: string;
  slot: string;
  requester: string;
  purpose: string;
}

export function RoomApprovalActions({
  requestId,
  summary,
}: {
  requestId: string;
  summary: ApprovalSummary;
}) {
  const router = useRouter();
  const toast = useToast();
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
        toast.error(response.error);
        return;
      }
      toast.success(`Đã khóa ${summary.room} cho ${summary.slot}.`);
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
        toast.error(response.error);
        return;
      }
      toast.success(
        mode === "reject"
          ? "Đã từ chối yêu cầu và gửi lý do cho người gửi."
          : "Đã gửi yêu cầu chỉnh sửa cho người gửi.",
      );
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

      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button
          type="button"
          variant="secondary"
          className="h-11 sm:h-10"
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
          className="h-11 sm:h-10"
          disabled={isPending}
          onClick={() => {
            setMode("reject");
            setReason("");
            setError(null);
          }}
        >
          Từ chối
        </Button>

        {/* Approval opens a transaction that hard-locks the room and cannot be
            undone from this screen, so it states exactly what is being committed
            before the administrator agrees. */}
        <ConfirmButton
          onConfirm={approve}
          disabled={isPending}
          loading={isPending}
          className="h-11 sm:h-10"
          title="Khóa phòng cho yêu cầu này?"
          consequence="Hệ thống sẽ tái kiểm tra trạng thái phòng theo thời gian thực rồi tạo booking cố định. Sau khi khóa, chỉ có thể giải phóng bằng cách hủy booking."
          details={[
            { label: "Phòng", value: summary.room },
            { label: "Thời gian", value: summary.slot },
            { label: "Người gửi", value: summary.requester },
            { label: "Mục đích", value: summary.purpose },
          ]}
          confirmLabel="Duyệt & khóa phòng"
        >
          {isPending ? "Đang tái kiểm tra…" : "Duyệt & khóa phòng"}
        </ConfirmButton>
      </div>

      <Dialog
        open={mode !== null}
        onOpenChange={(open) => {
          if (!open) setMode(null);
        }}
        title={mode === "changes" ? "Yêu cầu người gửi chỉnh sửa" : "Từ chối yêu cầu phòng"}
        description={
          mode === "changes"
            ? "Yêu cầu chuyển sang CHANGES_REQUESTED; người gửi có thể xem lý do và tạo phương án mới."
            : "Lý do sẽ được lưu, ghi vào nhật ký và gửi lại cho người gửi."
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
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => setMode(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant={mode === "reject" ? "danger" : "primary"}
              loading={isPending}
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
