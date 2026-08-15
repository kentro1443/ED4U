"use server";

import { redirect } from "next/navigation";
import { loginWithMemberCode } from "@/lib/auth";

export async function loginAction(_prev: { error?: string } | undefined, formData: FormData) {
  const code = String(formData.get("school_member_code") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const result = await loginWithMemberCode(code, password);
  if (!result.ok) return { error: result.error };
  if (result.mustChangePassword) redirect("/change-password");
  redirect("/dashboard");
}
