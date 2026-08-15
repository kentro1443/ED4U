import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default async function ModerationPage() {
  const actor = await requireRoute("/admin/moderation");
  // Report carries no tenantId of its own, so scope through the forum hierarchy
  // rather than reading every report in the database.
  const reports = await db.report.findMany({
    where: {
      post: { thread: { forum: { category: { tenantId: actor.tenantId } } } },
    },
    take: 20,
  });
  return (
    <div>
      <PageHeader
        title="Kiểm duyệt diễn đàn"
        description="Điều hành viên không sửa nội dung người dùng. Mọi hành động có lý do + audit."
      />
      {reports.length === 0 ? (
        <EmptyState title="Hàng đợi trống" action="Báo cáo sẽ gộp thành một hồ sơ kiểm duyệt." />
      ) : null}
    </div>
  );
}
