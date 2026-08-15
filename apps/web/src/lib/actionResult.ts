import { DomainError } from "@ed4u/domain";

/**
 * Server actions return a discriminated result rather than throwing into the
 * client. Domain errors already carry a Vietnamese message written for users;
 * anything else is reported generically so no stack trace or internal detail
 * reaches the browser.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

export function toActionError(error: unknown): { ok: false; error: string } {
  if (error instanceof DomainError) return { ok: false, error: error.message };
  if (error instanceof Error && error.message === "NOT_FOUND") {
    return { ok: false, error: "Không tìm thấy dữ liệu." };
  }
  console.error("[action] unexpected error", error);
  return { ok: false, error: "Đã có lỗi xảy ra. Vui lòng thử lại." };
}
