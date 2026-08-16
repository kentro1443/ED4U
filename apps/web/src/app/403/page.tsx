import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";
import { ForbiddenState } from "@/components/ui/Feedback";

export const metadata = {
  // The root layout template already appends "· ED4U".
  title: "Không đủ quyền",
  robots: { index: false, follow: false },
};

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] p-6">
      <div className="w-full max-w-md">
        <ForbiddenState
          title="Không đủ quyền truy cập (403)"
          description="Tài khoản của bạn không có quyền mở trang này. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ quản trị viên nhà trường."
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
