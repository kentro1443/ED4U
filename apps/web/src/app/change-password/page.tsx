"use client";

import { useActionState } from "react";
import { changePasswordAction } from "./actions";

export default function ChangePasswordPage() {
  const [state, action, pending] = useActionState(changePasswordAction, undefined);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="wordmark text-3xl text-[var(--pine)]">ED4U</p>
      <h1 className="mt-3 text-2xl font-medium">Đổi mật khẩu lần đầu</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Mật khẩu tạm thời phải được đổi trước khi dùng hệ thống.
      </p>
      <form action={action} className="mt-8 space-y-4">
        <label className="block text-sm">
          Mật khẩu tạm
          <input
            name="current"
            type="password"
            required
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Mật khẩu mới
          <input
            name="next"
            type="password"
            required
            minLength={10}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
          />
        </label>
        {state?.error ? (
          <p role="alert" className="text-sm text-red-800">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-[var(--pine)] px-4 py-2.5 text-white"
        >
          Lưu mật khẩu
        </button>
      </form>
    </main>
  );
}
