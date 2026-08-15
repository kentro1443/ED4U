import { canReadDiscussion, canWriteDiscussion } from "@ed4u/domain";
import { db } from "@/lib/db";
import { requireActor } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert, EmptyState, ForbiddenState } from "@/components/ui/Feedback";
import { PostActions, ReplyForm } from "@/features/discussion/DiscussionControls";

export default async function ThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (!canReadDiscussion(actor))
    return (
      <ForbiddenState
        title="Không có quyền truy cập"
        description="Tài khoản này không được đọc Discussion Hub."
      />
    );
  const { id } = await params;
  const thread = await db.thread.findFirst({
    where: { id, forum: { category: { tenantId: actor.tenantId } } },
    include: {
      forum: { include: { category: true } },
      posts: {
        where: { deletedAt: null },
        include: { reactions: true, reports: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread)
    return (
      <EmptyState title="Không tìm thấy chủ đề" description="Chủ đề không tồn tại hoặc đã bị gỡ." />
    );
  const authorIds = [...new Set(thread.posts.map((post) => post.authorId))];
  const users = await db.user.findMany({
    where: { tenantId: actor.tenantId, id: { in: authorIds } },
    select: { id: true, fullName: true },
  });
  const names = new Map(users.map((user) => [user.id, user.fullName]));
  const writable = canWriteDiscussion(actor);

  return (
    <div className="space-y-6">
      <PageHeader
        title={thread.title}
        description={`${thread.forum.category.name} · ${thread.forum.name}`}
        breadcrumbs={[
          { label: "Discussion Hub", href: "/discussion" },
          { label: thread.forum.name, href: `/discussion/forums/${thread.forumId}` },
          { label: thread.title },
        ]}
        badge={
          <Badge tone={thread.locked ? "danger" : "neutral"}>
            {thread.locked
              ? "Đã khóa"
              : thread.type === "QUESTION"
                ? "Câu hỏi"
                : thread.type === "ANNOUNCEMENT"
                  ? "Thông báo"
                  : "Thảo luận"}
          </Badge>
        }
      />
      {!writable.ok ? (
        <Alert tone="warning" title="Chế độ chỉ đọc">
          {writable.error.message}
        </Alert>
      ) : null}
      {thread.locked ? (
        <Alert tone="warning" title="Chủ đề đã khóa">
          Moderator đã khóa chủ đề; không thể đăng phản hồi mới.
        </Alert>
      ) : null}

      <div className="space-y-3">
        {thread.posts.map((post, index) => {
          const likes = post.reactions.filter((reaction) => reaction.kind === "LIKE");
          const helpful = post.reactions.filter((reaction) => reaction.kind === "HELPFUL");
          return (
            <Card
              key={post.id}
              className={`p-5 ${index === 0 ? "border-[var(--primary)]/20" : ""}`}
              data-testid="discussion-post"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--ink)]">
                    {names.get(post.authorId) ?? "Thành viên ED4U"}
                  </p>
                  <p className="text-[10px] text-[var(--muted)]">
                    {post.createdAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </p>
                </div>
                {index === 0 ? <Badge tone="brand">Bài mở đầu</Badge> : null}
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-[var(--body)]">
                {post.body}
              </p>
              <PostActions
                postId={post.id}
                liked={likes.some((reaction) => reaction.userId === actor.userId)}
                helpful={helpful.some((reaction) => reaction.userId === actor.userId)}
                likeCount={likes.length}
                helpfulCount={helpful.length}
                canWrite={writable.ok}
                canReport={post.authorId !== actor.userId}
              />
            </Card>
          );
        })}
      </div>
      {writable.ok && !thread.locked ? <ReplyForm threadId={thread.id} /> : null}
    </div>
  );
}
