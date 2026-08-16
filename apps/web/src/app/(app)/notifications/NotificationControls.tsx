"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

export function MarkAllReadButton({ unreadCount }: { unreadCount: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={unreadCount === 0 || pending}
      loading={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await markAllNotificationsReadAction();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success(`Đã đánh dấu ${result.count} thông báo là đã đọc.`);
          router.refresh();
        })
      }
    >
      <Icons.check className="h-4 w-4" aria-hidden="true" />
      {unreadCount === 0 ? "Đã đọc hết" : `Đánh dấu đã đọc (${unreadCount})`}
    </Button>
  );
}

export function MarkReadButton({ notificationId }: { notificationId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Đánh dấu thông báo này là đã đọc"
      title="Đánh dấu đã đọc"
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--ink)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      onClick={() =>
        startTransition(async () => {
          const result = await markNotificationReadAction(notificationId);
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      <Icons.check className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
