import Link from "next/link";

export const metadata = {
  title: "Không đủ quyền · ED4U",
  robots: { index: false, follow: false },
};

export default function ForbiddenPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="text-sm font-semibold tracking-[0.18em] text-[var(--muted)]">403</p>
      <h1 className="wordmark mt-2 text-3xl">Không đủ quyền</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Tài khoản của bạn không có quyền mở trang này. Nếu bạn cho rằng đây là nhầm lẫn, hãy liên hệ
        quản trị viên nhà trường.
      </p>
      <Link href="/dashboard" className="mt-6 text-sm underline">
        Về Tổng quan
      </Link>
    </main>
  );
}
