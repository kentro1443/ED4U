import { canReadDiscussion, canWriteDiscussion } from "@ed4u/domain";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert, ForbiddenState } from "@/components/ui/Feedback";
import { requireActor } from "@/lib/authz";

export default async function DiscussionPage() {
  const actor = await requireActor();
  const readable = canReadDiscussion(actor);

  // Strict server-side access guard: do not query categories from database if user cannot read discussion
  if (!readable) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Discussion Hub"
          description="Diễn đàn trao đổi học thuật và cộng đồng học sinh"
        />
        <ForbiddenState
          title="Không có quyền truy cập diễn đàn"
          description="Tài khoản Mentor cựu học sinh không tham gia diễn đàn học sinh ở phiên bản này."
        />
      </div>
    );
  }

  const writable = canWriteDiscussion(actor);
  const categories = await db.discussionCategory.findMany({
    where: { tenantId: actor.tenantId },
    include: {
      forums: {
        include: {
          threads: {
            include: { posts: true },
          },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Discussion Hub"
        description="Danh tính thật · Học sinh tốt nghiệp chuyển sang chế độ chỉ đọc · LIKE / HELPFUL (không downvote)."
      />

      {!writable.ok && (
        <Alert tone="warning" title="Chế độ chỉ đọc">
          {writable.error.message}
        </Alert>
      )}

      <div className="space-y-6">
        {categories.map((c) => (
          <section key={c.id} className="space-y-3">
            <h2 className="text-base font-bold text-[var(--ink)]">{c.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {c.forums.map((f) => (
                <Card key={f.id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-[var(--ink)]">{f.name}</h3>
                    <Badge size="sm">{f.threads.length} chủ đề</Badge>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                    {f.threads.map((t) => (
                      <li key={t.id} className="truncate">
                        <span className="text-[var(--ink)] font-medium">{t.title}</span> ·{" "}
                        {t.posts.length} phản hồi
                      </li>
                    ))}
                    {f.threads.length === 0 && <li>Chưa có bài viết.</li>}
                  </ul>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
