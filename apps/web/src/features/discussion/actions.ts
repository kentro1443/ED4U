"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import {
  canReadDiscussion,
  canWriteDiscussion,
  isAllowedReaction,
  moderate,
  REPORT_CATEGORIES,
  THREAD_TYPES,
  type ModerationAction,
  type ReportCategory,
  type ThreadType,
} from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor, requirePermission } from "@/lib/authz";

async function forumForActor(forumId: string, tenantId: string) {
  const forum = await db.forum.findFirst({
    where: { id: forumId, category: { tenantId } },
    include: { category: true },
  });
  if (!forum) throw new Error("Không tìm thấy diễn đàn.");
  return forum;
}

async function threadForActor(threadId: string, tenantId: string) {
  const thread = await db.thread.findFirst({
    where: { id: threadId, forum: { category: { tenantId } } },
    include: { forum: { include: { category: true } } },
  });
  if (!thread) throw new Error("Không tìm thấy chủ đề.");
  return thread;
}

export async function createThreadAction(input: {
  forumId: string;
  title: string;
  type: string;
  body: string;
}) {
  const actor = await requireActor();
  const writable = canWriteDiscussion(actor);
  if (!writable.ok) return { ok: false as const, error: writable.error.message };
  try {
    const forum = await forumForActor(input.forumId, actor.tenantId);
    const title = input.title.trim();
    const body = input.body.trim();
    if (title.length < 5 || title.length > 180) throw new Error("Tiêu đề phải có 5–180 ký tự.");
    if (body.length < 2 || body.length > 10_000)
      throw new Error("Nội dung phải có 2–10.000 ký tự.");
    if (!(THREAD_TYPES as readonly string[]).includes(input.type))
      throw new Error("Loại chủ đề không hợp lệ.");
    const type = input.type as ThreadType;
    if (
      type === "ANNOUNCEMENT" &&
      !actor.roles.some((role) => ["TEACHER", "SCHOOL_ADMIN", "ADMIN_IT"].includes(role))
    ) {
      throw new Error("Chỉ giáo viên hoặc quản trị được đăng thông báo.");
    }
    const thread = await db.$transaction(async (tx) => {
      const created = await tx.thread.create({
        data: {
          forumId: forum.id,
          title,
          type,
          authorId: actor.userId,
          posts: { create: { authorId: actor.userId, body } },
        },
      });
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "DISCUSSION_THREAD_CREATE",
          entityType: "Thread",
          entityId: created.id,
          requestId: randomUUID(),
          afterJson: { forumId: forum.id, type },
        },
      });
      return created;
    });
    revalidatePath(`/discussion/forums/${forum.id}`);
    return { ok: true as const, threadId: thread.id };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể tạo chủ đề.",
    };
  }
}

export async function replyThreadAction(threadId: string, body: string) {
  const actor = await requireActor();
  const writable = canWriteDiscussion(actor);
  if (!writable.ok) return { ok: false as const, error: writable.error.message };
  try {
    const thread = await threadForActor(threadId, actor.tenantId);
    if (thread.locked) throw new Error("Chủ đề đã bị khóa.");
    const text = body.trim();
    if (text.length < 1 || text.length > 10_000)
      throw new Error("Nội dung phải có 1–10.000 ký tự.");
    await db.post.create({ data: { threadId, authorId: actor.userId, body: text } });
    revalidatePath(`/discussion/threads/${threadId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể trả lời.",
    };
  }
}

export async function toggleReactionAction(postId: string, kind: string) {
  const actor = await requireActor();
  const writable = canWriteDiscussion(actor);
  if (!writable.ok) return { ok: false as const, error: writable.error.message };
  if (!isAllowedReaction(kind)) return { ok: false as const, error: "Reaction không hợp lệ." };
  try {
    const post = await db.post.findFirst({
      where: {
        id: postId,
        thread: { forum: { category: { tenantId: actor.tenantId } } },
        deletedAt: null,
      },
      select: { id: true, threadId: true },
    });
    if (!post) throw new Error("Không tìm thấy bài viết.");
    const existing = await db.reaction.findUnique({
      where: { postId_userId_kind: { postId, userId: actor.userId, kind } },
    });
    if (existing) await db.reaction.delete({ where: { id: existing.id } });
    else await db.reaction.create({ data: { postId, userId: actor.userId, kind } });
    revalidatePath(`/discussion/threads/${post.threadId}`);
    return { ok: true as const, active: !existing };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể reaction.",
    };
  }
}

export async function reportPostAction(postId: string, category: string) {
  const actor = await requireActor();
  if (!canReadDiscussion(actor))
    return { ok: false as const, error: "Bạn không có quyền đọc diễn đàn." };
  if (!(REPORT_CATEGORIES as readonly string[]).includes(category))
    return { ok: false as const, error: "Danh mục báo cáo không hợp lệ." };
  try {
    const post = await db.post.findFirst({
      where: {
        id: postId,
        thread: { forum: { category: { tenantId: actor.tenantId } } },
        deletedAt: null,
      },
      select: { id: true, threadId: true, authorId: true },
    });
    if (!post) throw new Error("Không tìm thấy bài viết.");
    if (post.authorId === actor.userId)
      throw new Error("Bạn không thể báo cáo chính bài viết của mình.");
    const duplicate = await db.report.findFirst({ where: { postId, reporterId: actor.userId } });
    if (duplicate) throw new Error("Bạn đã báo cáo bài viết này.");
    await db.report.create({
      data: { postId, reporterId: actor.userId, category: category as ReportCategory },
    });
    revalidatePath(`/discussion/threads/${post.threadId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể gửi báo cáo.",
    };
  }
}

export async function moderateContentAction(input: {
  reportId: string;
  action: ModerationAction;
  reason: string;
}) {
  const actor = await requirePermission("forum.moderate");
  try {
    const decision = moderate(input.action, input.reason);
    if (!decision.ok) throw decision.error;
    const report = await db.report.findFirst({
      where: {
        id: input.reportId,
        post: { thread: { forum: { category: { tenantId: actor.tenantId } } } },
      },
      include: { post: { include: { thread: true } } },
    });
    if (!report) throw new Error("Không tìm thấy báo cáo trong tenant này.");

    await db.$transaction(async (tx) => {
      let caseId = report.caseId;
      if (!caseId) {
        const moderationCase = await tx.moderationCase.create({ data: {} });
        caseId = moderationCase.id;
        await tx.report.update({ where: { id: report.id }, data: { caseId } });
      }
      await tx.moderationActionRow.create({
        data: {
          caseId,
          action: decision.value.action,
          reason: decision.value.reason,
          actorId: actor.userId,
        },
      });
      if (decision.value.action === "HIDE_POST" || decision.value.action === "DELETE_POST") {
        await tx.post.update({ where: { id: report.postId }, data: { deletedAt: new Date() } });
      }
      if (decision.value.action === "LOCK_THREAD") {
        await tx.thread.update({ where: { id: report.post.threadId }, data: { locked: true } });
      }
      if (decision.value.action === "WARN") {
        await tx.notification.create({
          data: {
            tenantId: actor.tenantId,
            userId: report.post.authorId,
            type: "FORUM_MODERATION_WARNING",
            title: "Cảnh báo kiểm duyệt diễn đàn",
            body: decision.value.reason,
            entityType: "Post",
            entityId: report.postId,
          },
        });
      }
      await tx.auditEvent.create({
        data: {
          tenantId: actor.tenantId,
          actorId: actor.userId,
          action: "FORUM_MODERATE",
          entityType: "Post",
          entityId: report.postId,
          requestId: randomUUID(),
          afterJson: { action: decision.value.action, reason: decision.value.reason },
        },
      });
    });
    revalidatePath("/admin/moderation");
    revalidatePath(`/discussion/threads/${report.post.threadId}`);
    return { ok: true as const };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Không thể kiểm duyệt.",
    };
  }
}
