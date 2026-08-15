import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/Feedback";
import { ModerationControls } from "@/features/discussion/DiscussionControls";

export default async function ModerationPage() {
  const actor = await requireRoute("/admin/moderation");
  const reports = await db.report.findMany({
    where: {
      post: {
        thread: { forum: { category: { tenantId: actor.tenantId } } },
      },
    },
    include: {
      post: {
        include: {
          thread: { include: { forum: true } },
        },
      },
      case: { include: { actions: { orderBy: { createdAt: "desc" } } } },
    },
    orderBy: { id: "desc" },
    take: 50,
  });
  const userIds = [
    ...new Set(reports.flatMap((report) => [report.reporterId, report.post.authorId])),
  ];
  const users = await db.user.findMany({
    where: { tenantId: actor.tenantId, id: { in: userIds } },
    select: { id: true, fullName: true },
  });
  const names = new Map(users.map((user) => [user.id, user.fullName]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiểm duyệt diễn đàn"
        description="Reactive human moderation — moderator không chỉnh sửa nội dung người dùng. Mọi quyết định đều cần lý do và được audit."
        badge={<Badge tone="warning">SCHOOL_ADMIN</Badge>}
      />
      {reports.length === 0 ? (
        <EmptyState
          title="Không có báo cáo"
          description="Báo cáo từ Discussion Hub sẽ xuất hiện ở đây."
        />
      ) : (
        <div className="space-y-4">
          {reports.map((report) => {
            const latest = report.case?.actions[0];
            return (
              <Card key={report.id} className="p-5" data-testid="moderation-report">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="danger">{report.category}</Badge>
                      <span className="text-xs text-[var(--muted)]">
                        Báo cáo bởi {names.get(report.reporterId) ?? "Thành viên"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm font-semibold text-[var(--ink)]">
                      {report.post.thread.title}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Tác giả: {names.get(report.post.authorId) ?? "Thành viên"} ·{" "}
                      {report.post.thread.forum.name}
                    </p>
                    <blockquote className="mt-3 rounded-lg border-l-2 border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-xs text-[var(--body)]">
                      {report.post.deletedAt ? "[Nội dung đã bị ẩn/xóa]" : report.post.body}
                    </blockquote>
                    {latest ? (
                      <p className="mt-3 text-[11px] text-[var(--muted)]">
                        Quyết định gần nhất: <strong>{latest.action}</strong> · {latest.reason}
                      </p>
                    ) : null}
                  </div>
                </div>
                <ModerationControls reportId={report.id} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
