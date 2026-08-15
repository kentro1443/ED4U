import Link from "next/link";
import { canReadDiscussion, canWriteDiscussion } from "@ed4u/domain";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert, ForbiddenState } from "@/components/ui/Feedback";
import { requireActor } from "@/lib/authz";

export default async function DiscussionPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireActor();
  const query = (await searchParams).q?.trim() ?? "";
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
            where: query
              ? {
                  OR: [
                    { title: { contains: query, mode: "insensitive" } },
                    {
                      posts: {
                        some: { body: { contains: query, mode: "insensitive" }, deletedAt: null },
                      },
                    },
                  ],
                }
              : undefined,
            include: { posts: { where: { deletedAt: null } } },
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

      <form method="get" className="flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={query}
          placeholder="Tìm chủ đề hoặc nội dung bài viết…"
          className="h-10 flex-1 rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]"
          aria-label="Tìm kiếm Discussion Hub"
        />
        <button
          type="submit"
          className="rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--on-primary)]"
        >
          Tìm
        </button>
      </form>

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
                  <div className="flex items-center justify-between gap-3">
                    <Link
                      href={`/discussion/forums/${f.id}`}
                      className="font-semibold text-sm text-[var(--ink)] hover:underline"
                    >
                      {f.name}
                    </Link>
                    <Badge size="sm">{f.threads.length} chủ đề</Badge>
                  </div>
                  <ul className="space-y-1.5 text-xs text-[var(--muted)]">
                    {f.threads.map((t) => (
                      <li key={t.id} className="truncate">
                        <Link
                          href={`/discussion/threads/${t.id}`}
                          className="text-[var(--ink)] font-medium hover:underline"
                        >
                          {t.title}
                        </Link>{" "}
                        · {t.posts.length} phản hồi
                      </li>
                    ))}
                    {f.threads.length === 0 && <li>Chưa có bài viết.</li>}
                  </ul>
                  <Link
                    href={`/discussion/forums/${f.id}`}
                    className="inline-block text-xs font-semibold underline underline-offset-4"
                  >
                    Mở diễn đàn →
                  </Link>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
