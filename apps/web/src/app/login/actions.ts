"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { loginWithMemberCode } from "@/lib/auth";
import {
  assertLoginAllowed,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/security/loginThrottle";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const code = String(formData.get("school_member_code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const requestHeaders = await headers();
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || requestHeaders.get("x-real-ip") || "unknown";
  try {
    await assertLoginAllowed(ip, code);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Đăng nhập tạm thời bị giới hạn." };
  }

  const result = await loginWithMemberCode(code, password);
  if (!result.ok) {
    await recordLoginFailure(ip, code);
    return { error: result.error };
  }
  await recordLoginSuccess(ip, code);
  if (result.mustChangePassword) redirect("/change-password");
  redirect("/dashboard");
}
