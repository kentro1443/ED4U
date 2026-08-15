import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/PageHeader";

export default async function ModerationPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const reports = await db.report.findMany({ take: 20 });
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
