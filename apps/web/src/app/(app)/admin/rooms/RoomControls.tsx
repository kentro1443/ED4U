"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Dialog, DropdownMenu } from "@/components/ui/Overlays";
import { IconButton } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { createRoomAction, setRoomStatusAction } from "./actions";

export interface RoomTypeOption {
  id: string;
  label: string;
}

export function CreateRoomButton({ roomTypes }: { roomTypes: RoomTypeOption[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createRoomAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(`Đã tạo phòng ${result.code}.`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Thêm phòng"
      description="Phòng mới ở trạng thái ACTIVE và lập tức trở thành ứng viên cho Facility Engine."
      trigger={
        <Button size="sm" disabled={roomTypes.length === 0}>
          <Icons.plus className="h-4 w-4" aria-hidden="true" />
          Thêm phòng
        </Button>
      }
    >
      <form action={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="room-code" label="Mã phòng" required>
            <Input id="room-code" name="code" required placeholder="R21" className="font-mono" />
          </Field>
          <Field id="room-capacity" label="Sức chứa" required>
            <Input
              id="room-capacity"
              name="capacity"
              type="number"
              min={1}
              max={2000}
              required
              placeholder="40"
            />
          </Field>
        </div>
        <Field id="room-name" label="Tên phòng" required>
          <Input id="room-name" name="name" required placeholder="Phòng thí nghiệm Lý" />
        </Field>
        <Field id="room-type" label="Loại phòng" required>
          <Select id="room-type" name="roomTypeId" required>
            <option value="">— Chọn loại phòng —</option>
            {roomTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="room-building" label="Tòa nhà" required>
            <Input id="room-building" name="building" required placeholder="A" />
          </Field>
          <Field id="room-floor" label="Tầng" required>
            <Input id="room-floor" name="floor" required placeholder="2" />
          </Field>
        </div>

        {error && (
          <Alert tone="danger" title="Không thể tạo phòng">
            {error}
          </Alert>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Hủy
          </Button>
          <Button type="submit" loading={pending}>
            Tạo phòng
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Đang dùng",
  MAINTENANCE: "Bảo trì",
  DISABLED: "Ngừng sử dụng",
};

export function RoomStatusActions({
  roomId,
  roomLabel,
  status,
}: {
  roomId: string;
  roomLabel: string;
  status: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    startTransition(async () => {
      const result = await setRoomStatusAction(roomId, next);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.affected > 0
          ? `${roomLabel} → ${STATUS_LABELS[next]}. Còn ${result.affected} booking đã xác nhận trong tương lai — hãy xử lý thủ công.`
          : `${roomLabel} → ${STATUS_LABELS[next]}.`,
      );
      router.refresh();
    });
  }

  return (
    <DropdownMenu
      trigger={
        <IconButton
          label={`Đổi trạng thái ${roomLabel}`}
          variant="ghost"
          size="sm"
          disabled={pending}
        >
          <Icons.moreVertical className="h-4 w-4" />
        </IconButton>
      }
      items={["ACTIVE", "MAINTENANCE", "DISABLED"]
        .filter((option) => option !== status)
        .map((option) => ({
          label: `Chuyển sang ${STATUS_LABELS[option]}`,
          onClick: () => change(option),
          danger: option === "DISABLED",
        }))}
    />
  );
}
