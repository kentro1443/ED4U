"use server";

import { redirect } from "next/navigation";
import { changePassword, currentActor, loginWithMemberCode } from "@/lib/auth";

export async function changePasswordAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const actor = await currentActor();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (!actor) {
    return { error: "Phiên đăng nhập đã hết hạn." };
  }
  const result = await changePassword(actor.userId, current, next);
  if (!result.ok) return { error: result.error };
  const again = await loginWithMemberCode(actor.schoolMemberCode, next);
  if (!again.ok) return { error: again.error };
  redirect("/dashboard");
}
