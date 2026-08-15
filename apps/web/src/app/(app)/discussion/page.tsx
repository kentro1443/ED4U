import { canReadDiscussion, canWriteDiscussion } from "@ed4u/domain";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";

export default async function DiscussionPage() {
  const actor = await requireActor();
  const readable = canReadDiscussion(actor);
  const writable = canWriteDiscussion(actor);
  const categories = await db.discussionCategory.findMany({
    where: { tenantId: actor.tenantId },
    include: { forums: { include: { threads: { include: { posts: true } } } } },
  });
  return (
    <div>
      <PageHeader
        title="Discussion Hub"
        description="Danh tính thật. Tốt nghiệp chỉ đọc. LIKE/HELPFUL — không downvote."
      />
      {!readable ? <p>Mentor không vào diễn đàn chung ở V1.</p> : null}
      {!writable.ok ? (
        <p className="text-sm text-[var(--muted)]">{writable.error.message}</p>
      ) : null}
      {categories.map((c) => (
        <section key={c.id} className="mt-6">
          <h2 className="font-medium">{c.name}</h2>
          {c.forums.map((f) => (
            <div
              key={f.id}
              className="mt-2 rounded-xl border border-[var(--line)] bg-[var(--card)] p-4"
            >
              <h3>{f.name}</h3>
              <ul className="mt-2 text-sm">
                {f.threads.map((t) => (
                  <li key={t.id}>
                    {t.title} · {t.posts.length} bài
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
