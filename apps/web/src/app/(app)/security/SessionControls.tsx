"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { ConfirmButton } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { revokeOtherSessionsAction, revokeSessionAction } from "./actions";

export function RevokeSessionButton({
  sessionId,
  startedLabel,
}: {
  sessionId: string;
  startedLabel: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <ConfirmButton
      variant="secondary"
      confirmVariant="danger"
      size="sm"
      loading={pending}
      title="Thu hồi phiên đăng nhập này?"
      consequence="Thiết bị đang dùng phiên này sẽ bị đăng xuất ngay lập tức và phải đăng nhập lại."
      details={[{ label: "Bắt đầu", value: startedLabel }]}
      confirmLabel="Thu hồi"
      onConfirm={() =>
        startTransition(async () => {
          const result = await revokeSessionAction(sessionId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Đã thu hồi phiên đăng nhập.");
          router.refresh();
        })
      }
    >
      Thu hồi
    </ConfirmButton>
  );
}

export function RevokeAllButton({ otherCount }: { otherCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  if (otherCount === 0) {
    return (
      <Button variant="secondary" size="sm" disabled>
        Không có phiên nào khác
      </Button>
    );
  }

  return (
    <ConfirmButton
      variant="secondary"
      confirmVariant="danger"
      size="sm"
      loading={pending}
      title="Đăng xuất khỏi mọi thiết bị khác?"
      consequence="Phiên bạn đang dùng được giữ nguyên. Mọi thiết bị khác sẽ phải đăng nhập lại."
      details={[{ label: "Số phiên bị thu hồi", value: String(otherCount) }]}
      confirmLabel="Thu hồi tất cả"
      onConfirm={() =>
        startTransition(async () => {
          const result = await revokeOtherSessionsAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Đã thu hồi ${result.revoked} phiên đăng nhập.`);
          router.refresh();
        })
      }
    >
      Đăng xuất thiết bị khác
    </ConfirmButton>
  );
}
