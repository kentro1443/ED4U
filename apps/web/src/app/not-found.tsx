import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 bg-[var(--canvas)]">
      <EmptyState
        title="404 · Không tìm thấy trang"
        description="Đường dẫn bạn yêu cầu không tồn tại hoặc đã được di chuyển."
        action={
          <LinkButton href="/dashboard" variant="primary" size="md">
            Về trang Tổng quan
          </LinkButton>
        }
      />
    </main>
  );
}
