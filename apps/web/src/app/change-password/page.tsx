"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";
import { BrandLogo } from "@/components/BrandLogo";

export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--canvas)] p-4 sm:p-6">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(37,99,235,.14),transparent_28%),radial-gradient(circle_at_85%_80%,rgba(96,165,250,.12),transparent_30%)]" />
      <div className="relative w-full max-w-md space-y-6">
        <div className="space-y-3 text-center">
          <BrandLogo href="/" className="mx-auto w-36" priority />
          <h1 className="text-2xl font-extrabold tracking-[-0.04em] text-[var(--ink)] sm:text-3xl">
            Đổi mật khẩu lần đầu
          </h1>
          <p className="mx-auto max-w-xs text-sm leading-6 text-[var(--muted)]">
            Mật khẩu tạm thời phải được đổi trước khi sử dụng hệ thống{" "}
            <span className="font-semibold text-[var(--ink)]">ED4U</span>
          </p>
        </div>

        <Card className="rounded-[28px] p-6 shadow-[var(--shadow-lg)] sm:p-7">
          <form action={action} className="space-y-4">
            <Field id="current" label="Mật khẩu tạm hiện tại" required>
              <Input name="current" type="password" required placeholder="Nhập mật khẩu tạm thời" />
            </Field>

            <Field id="next" label="Mật khẩu mới" description="Tối thiểu 10 ký tự" required>
              <Input
                name="next"
                type="password"
                required
                minLength={10}
                placeholder="Nhập mật khẩu mới (tối thiểu 10 ký tự)"
              />
            </Field>

            {state?.error && (
              <Alert tone="danger" title="Không thể đổi mật khẩu">
                {state.error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={pending}
              loadingLabel="Đang lưu mật khẩu…"
              className="mt-2 w-full"
            >
              Lưu mật khẩu & Tiếp tục
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
