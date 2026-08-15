import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/PageHeader";

export default async function TimetableAdminPage() {
  const actor = await requireRoute("/admin/timetable");
  const periods = await db.academicPeriod.findMany({
    where: { tenantId: actor.tenantId },
    orderBy: { sortOrder: "asc" },
  });
  return (
    <div>
      <PageHeader
        title="Thời khóa biểu"
        description="Tiết học do trường cấu hình. Import Excel là giao dịch — sai một dòng là từ chối cả file."
      />
      <ul className="text-sm">
        {periods.map((p) => (
          <li key={p.id}>
            {p.code}: {p.startTime}–{p.endTime}
          </li>
        ))}
      </ul>
    </div>
  );
}
