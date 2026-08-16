import { LinkButton } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Feedback";
import { BrandLogo } from "@/components/BrandLogo";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--canvas)] p-6">
      <div className="w-full max-w-md space-y-6">
        <BrandLogo href="/" className="mx-auto w-32" />
        <EmptyState
          title="404 · Không tìm thấy trang"
          description="Đường dẫn bạn yêu cầu không tồn tại hoặc đã được di chuyển."
          action={
            <LinkButton href="/dashboard" variant="primary" size="md">
              Về trang Tổng quan
            </LinkButton>
          }
        />
      </div>
    </main>
  );
}
