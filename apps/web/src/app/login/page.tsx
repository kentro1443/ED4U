"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Feedback";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--canvas)] p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--primary)] text-lg font-bold text-[var(--on-primary)] shadow-sm">
            E
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)] sm:text-3xl">
            Đăng nhập
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] max-w-xs mx-auto">
            Hệ thống quản lý và vận hành trường học{" "}
            <span className="font-semibold text-[var(--ink)]">ED4U</span>
          </p>
        </div>

        <Card className="shadow-md">
          <form action={action} className="space-y-4">
            <Field
              id="school_member_code"
              label="Mã thành viên trường"
              description="Dùng mã thành viên (VD: HS000001, GV000001, AD000001, IT000001)"
              required
            >
              <Input
                name="school_member_code"
                autoComplete="username"
                placeholder="VD: HS000001"
                required
              />
            </Field>

            <Field id="password" label="Mật khẩu" required>
              <Input
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                required
              />
            </Field>

            {state?.error && (
              <Alert tone="danger" title="Đăng nhập không thành công">
                {state.error}
              </Alert>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={pending}
              loadingLabel="Đang đăng nhập…"
              className="w-full mt-2 font-semibold"
            >
              Đăng nhập vào trường
            </Button>
          </form>
        </Card>

        <p className="text-center text-[11px] text-[var(--muted)]">
          Demo Trường THPT ED4U · Asia/Ho_Chi_Minh
        </p>
      </div>
    </main>
  );
}
