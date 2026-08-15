"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-lg font-bold text-[var(--on-primary)] shadow-sm">
            E
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Đổi mật khẩu lần đầu
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xs mx-auto">
            Mật khẩu tạm thời phải được đổi trước khi sử dụng hệ thống{" "}
            <span className="font-semibold text-[var(--ink)]">ED4U</span>
          </p>
        </div>

        <Card className="shadow-md">
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
              className="w-full mt-2 font-semibold"
            >
              Lưu mật khẩu & Tiếp tục
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}
