"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "./actions";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";

const TRUST_POINTS = [
  "Một tài khoản cho toàn bộ hoạt động trường học",
  "Dữ liệu và quyền truy cập tách biệt theo vai trò",
  "Trợ lý thông minh có kiểm chứng và phê duyệt của con người",
];

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <main className="grid min-h-dvh bg-[var(--canvas)] lg:grid-cols-[minmax(0,1.05fr)_minmax(30rem,0.95fr)]">
      <section className="relative hidden overflow-hidden bg-[var(--surface-dark)] px-12 py-12 text-white lg:flex lg:flex-col lg:justify-between xl:px-20 xl:py-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(37,99,235,0.38),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(29,78,216,0.22),transparent_38%)]" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.5)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.5)_1px,transparent_1px)] [background-size:40px_40px]" />
        <div className="relative z-10">
          <div className="inline-flex rounded-2xl bg-white px-4 py-3 shadow-2xl shadow-blue-950/30">
            <BrandLogo className="w-40" priority />
          </div>
        </div>

        <div className="relative z-10 max-w-2xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.14em] text-blue-200">
            Nền tảng vận hành trường học
          </p>
          <h1 className="max-w-xl text-4xl font-extrabold leading-[1.12] tracking-[-0.045em] text-white xl:text-5xl">
            Mọi hoạt động quan trọng, trong một không gian đáng tin cậy.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">
            ED4U kết nối học tập, lịch, phòng, câu lạc bộ và hỗ trợ học sinh thành những quy trình
            rõ ràng cho cả nhà trường.
          </p>
          <ul className="mt-8 space-y-4" aria-label="Điểm nổi bật">
            {TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-3 text-sm font-medium text-slate-100"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-300/20">
                  <Icons.check className="h-4 w-4" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative z-10 text-xs text-slate-400">
          ED4U · Thiết kế cho môi trường giáo dục Việt Nam
        </p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-5 py-10 sm:px-10 lg:px-14">
        <div className="w-full max-w-[29rem]">
          <div className="mb-10 flex justify-center lg:hidden">
            <BrandLogo className="w-40" priority />
          </div>

          <div className="mb-8">
            <p className="text-sm font-semibold text-[var(--primary)]">Chào mừng trở lại</p>
            <h2 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-[var(--ink)] sm:text-4xl">
              Đăng nhập vào ED4U
            </h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[var(--muted)]">
              Sử dụng mã thành viên do nhà trường cấp để tiếp tục vào không gian làm việc.
            </p>
          </div>

          <form
            action={action}
            className="rounded-[28px] border border-[var(--hairline)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-lg)] sm:p-7"
          >
            <div className="space-y-5">
              <Field id="school_member_code" label="Mã thành viên trường" required>
                <Input
                  name="school_member_code"
                  autoComplete="username"
                  placeholder="Ví dụ: HS000001"
                  required
                  className="h-12"
                />
              </Field>

              <Field id="password" label="Mật khẩu" required>
                <Input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Nhập mật khẩu"
                  required
                  className="h-12"
                />
              </Field>

              {state?.error && (
                <Alert tone="danger" title="Không thể đăng nhập">
                  {state.error}
                </Alert>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={pending}
                loadingLabel="Đang xác thực…"
                className="w-full"
              >
                Tiếp tục vào trường
                <Icons.arrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </form>

          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--muted)]">
            <Link href="/" className="font-semibold text-[var(--primary)] hover:underline">
              Tìm hiểu về ED4U
            </Link>
            <span>Hỗ trợ truy cập: liên hệ quản trị viên trường</span>
          </div>
        </div>
      </section>
    </main>
  );
}
