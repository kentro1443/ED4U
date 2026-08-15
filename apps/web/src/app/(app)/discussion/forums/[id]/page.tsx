import Link from "next/link";
import { canReadDiscussion, canWriteDiscussion } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ForbiddenState, EmptyState } from "@/components/ui/Feedback";
import { CreateThreadForm } from "@/features/discussion/DiscussionControls";

export default async function ForumPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!canReadDiscussion(actor))
    return (
      <ForbiddenState
        title="Không có quyền truy cập"
        description="Tài khoản này không được đọc Discussion Hub."
      />
    );
  const { id } = await params;
  const forum = await db.forum.findFirst({
    where: { id, category: { tenantId: actor.tenantId } },
    include: {
      category: true,
      threads: {
        include: { posts: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 } },
        orderBy: [{ pinned: "desc" }, { title: "asc" }],
      },
    },
  });
  if (!forum)
    return (
      <EmptyState
        title="Không tìm thấy diễn đàn"
        description="Diễn đàn không tồn tại trong trường hiện tại."
      />
    );
  const authorIds = [...new Set(forum.threads.map((thread) => thread.authorId))];
  const users = await db.user.findMany({
    where: { tenantId: actor.tenantId, id: { in: authorIds } },
    select: { id: true, fullName: true },
  });
  const names = new Map(users.map((user) => [user.id, user.fullName]));
  const writable = canWriteDiscussion(actor);
  const canAnnounce = actor.roles.some((role) =>
    ["TEACHER", "SCHOOL_ADMIN", "ADMIN_IT"].includes(role),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={forum.name}
        description={`Discussion Hub · ${forum.category.name}`}
        breadcrumbs={[{ label: "Discussion Hub", href: "/discussion" }, { label: forum.name }]}
      />
      {writable.ok ? <CreateThreadForm forumId={forum.id} canAnnounce={canAnnounce} /> : null}
      {forum.threads.length === 0 ? (
        <EmptyState
          title="Chưa có chủ đề"
          description={
            writable.ok ? "Hãy tạo chủ đề đầu tiên." : "Tài khoản của bạn đang ở chế độ chỉ đọc."
          }
        />
      ) : (
        <div className="space-y-3">
          {forum.threads.map((thread) => (
            <Card key={thread.id} className="p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/discussion/threads/${thread.id}`}
                      className="font-semibold text-[var(--ink)] hover:underline"
                    >
                      {thread.title}
                    </Link>
                    <Badge tone={thread.type === "ANNOUNCEMENT" ? "brand" : "neutral"}>
                      {thread.type === "QUESTION"
                        ? "Câu hỏi"
                        : thread.type === "ANNOUNCEMENT"
                          ? "Thông báo"
                          : "Thảo luận"}
                    </Badge>
                    {thread.pinned ? <Badge tone="warning">Ghim</Badge> : null}
                    {thread.locked ? <Badge tone="danger">Đã khóa</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {names.get(thread.authorId) ?? "Thành viên ED4U"} ·{" "}
                    {thread.posts.length ? "Có bài viết" : "Chưa có phản hồi"}
                  </p>
                </div>
                <Link
                  href={`/discussion/threads/${thread.id}`}
                  className="text-xs font-semibold underline"
                >
                  Mở chủ đề →
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
