import { ForbiddenError, err, ok, type Result } from "./errors";
import type { Actor } from "./membership";
import { isGraduated } from "./membership";

export const THREAD_TYPES = ["DISCUSSION", "QUESTION", "ANNOUNCEMENT"] as const;
export type ThreadType = (typeof THREAD_TYPES)[number];

export const REACTIONS = ["LIKE", "HELPFUL"] as const;
export type ReactionKind = (typeof REACTIONS)[number];

export const REPORT_CATEGORIES = [
  "harassment",
  "bullying",
  "spam",
  "hateful_content",
  "sexual_content",
  "personal_information",
  "cheating",
  "misinformation",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const MODERATION_ACTIONS = [
  "NO_ACTION",
  "WARN",
  "HIDE_POST",
  "DELETE_POST",
  "LOCK_THREAD",
  "SUSPEND_FORUM_ACCESS",
  "ESCALATE",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export function canWriteDiscussion(actor: Actor): Result<true, ForbiddenError> {
  if (
    actor.roles.includes("MENTOR") &&
    !actor.roles.includes("SCHOOL_ADMIN") &&
    !actor.roles.includes("TEACHER")
  ) {
    return err(new ForbiddenError("Mentor không truy cập diễn đàn chung ở phiên bản này."));
  }
  if (isGraduated(actor)) {
    return err(new ForbiddenError("Học sinh đã tốt nghiệp chỉ được đọc diễn đàn."));
  }
  if (
    actor.membershipStatus !== "ACTIVE" &&
    !actor.roles.includes("SCHOOL_ADMIN") &&
    !actor.roles.includes("TEACHER")
  ) {
    return err(new ForbiddenError("Tài khoản không được viết bài."));
  }
  return ok(true);
}

export function canReadDiscussion(actor: Actor): boolean {
  if (
    actor.roles.includes("MENTOR") &&
    !actor.roles.includes("TEACHER") &&
    !actor.roles.includes("SCHOOL_ADMIN")
  ) {
    return false;
  }
  return actor.membershipStatus === "ACTIVE" || actor.membershipStatus === "GRADUATED";
}

export function isAllowedReaction(kind: string): kind is ReactionKind {
  return (REACTIONS as readonly string[]).includes(kind);
}

export interface ModerationDecision {
  action: ModerationAction;
  reason: string;
  editsUserContent: boolean;
}

/** Moderator never edits user content. Every action requires a reason. */
export function moderate(
  action: ModerationAction,
  reason: string,
): Result<ModerationDecision, ForbiddenError> {
  if (!reason.trim()) {
    return err(new ForbiddenError("Mọi thao tác kiểm duyệt phải có lý do."));
  }
  return ok({ action, reason: reason.trim(), editsUserContent: false });
}
