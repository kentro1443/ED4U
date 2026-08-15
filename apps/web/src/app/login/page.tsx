"use client";

import { useActionState } from "react";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <p className="wordmark text-4xl text-[var(--pine)]">ED4U</p>
      <h1 className="mt-3 text-2xl font-medium">Đăng nhập</h1>
      <p className="mt-1 text-sm text-[var(--muted)]">
        Dùng mã thành viên trường (school member code), không dùng email.
      </p>
      <form action={action} className="mt-8 space-y-4">
        <label className="block text-sm">
          Mã thành viên
          <input
            name="school_member_code"
            autoComplete="username"
            required
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-white px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Mật khẩu
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
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
          className="w-full rounded-full bg-[var(--pine)] px-4 py-2.5 text-white disabled:opacity-60"
        >
          {pending ? "Đang vào…" : "Vào trường"}
        </button>
      </form>
    </main>
  );
}
