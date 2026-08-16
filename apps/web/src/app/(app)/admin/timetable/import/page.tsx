import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { TimetableImportForm } from "./TimetableImportForm";

export const metadata: Metadata = { title: "Import thời khóa biểu" };

export default async function TimetableImportPage() {
  const actor = await requireRoute("/admin/timetable/import");

  const [semesters, counts] = await Promise.all([
    db.semester.findMany({
      where: { year: { tenantId: actor.tenantId } },
      include: { year: { select: { name: true } } },
      orderBy: { startsOn: "desc" },
    }),
    Promise.all([
      db.class.count({ where: { tenantId: actor.tenantId } }),
      db.subject.count({ where: { tenantId: actor.tenantId } }),
      db.room.count({ where: { tenantId: actor.tenantId } }),
      db.academicPeriod.count({ where: { tenantId: actor.tenantId } }),
    ]),
  ]);

  const [classCount, subjectCount, roomCount, periodCount] = counts;

  const entryCounts = await db.timetableEntry.groupBy({
    by: ["semesterId"],
    where: { tenantId: actor.tenantId },
    _count: { semesterId: true },
  });
  const entriesBySemester = new Map(
    entryCounts.map((row) => [row.semesterId, row._count.semesterId]),
  );

  const prerequisitesMet =
    classCount > 0 && subjectCount > 0 && roomCount > 0 && periodCount > 0 && semesters.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import thời khóa biểu"
        description="Nhập là một giao dịch: toàn bộ thời khóa biểu của học kỳ được thay thế, hoặc không có gì thay đổi. Sai một dòng là từ chối cả tệp."
        badge={<Badge tone="dark">timetable.import</Badge>}
      />

      {!prerequisitesMet ? (
        <Alert tone="warning" title="Chưa đủ dữ liệu nền để nhập">
          <p className="mb-2">
            Thời khóa biểu tham chiếu tới lớp, môn, phòng và tiết đã tồn tại. Hãy tạo đủ các mục sau
            trước khi nhập:
          </p>
          <ul className="list-inside list-disc space-y-0.5">
            {classCount === 0 && <li>Chưa có lớp nào.</li>}
            {subjectCount === 0 && <li>Chưa có môn học nào.</li>}
            {roomCount === 0 && <li>Chưa có phòng nào.</li>}
            {periodCount === 0 && <li>Chưa cấu hình tiết học.</li>}
            {semesters.length === 0 && <li>Chưa có học kỳ nào.</li>}
          </ul>
        </Alert>
      ) : (
        <TimetableImportForm
          semesters={semesters.map((semester) => ({
            id: semester.id,
            label: `${semester.year.name} · ${semester.name}`,
            existingEntries: entriesBySemester.get(semester.id) ?? 0,
          }))}
        />
      )}

      <Card>
        <h2 className="text-sm font-semibold text-[var(--ink)]">Định dạng tệp</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          CSV UTF-8, dòng đầu tiên là tiêu đề. Mã tham chiếu phải khớp chính xác với dữ liệu đã có
          trong trường; hệ thống không tự tạo lớp, môn hay phòng mới từ tệp.
        </p>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 font-mono text-[11px] leading-relaxed text-[var(--body)]">
          {`class_code,subject_code,teacher_code,room_code,weekday,period_code
10A1,TOAN,GV000001,R05,MON,P1
10A1,VAN,GV000002,R05,MON,P2
10A2,TOAN,GV000001,R06,TUE,P1`}
        </pre>
        <dl className="mt-4 space-y-2 text-xs">
          <div>
            <dt className="font-semibold text-[var(--ink)]">weekday</dt>
            <dd className="text-[var(--muted)]">
              MON, TUE, WED, THU, FRI — hoặc dạng tiếng Việt T2–T6.
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-[var(--ink)]">Kiểm tra trước khi ghi</dt>
            <dd className="text-[var(--muted)]">
              Một phòng, một giáo viên và một lớp chỉ được xuất hiện đúng một lần trong mỗi tiết. Vi
              phạm sẽ được báo kèm số dòng xung đột và toàn bộ tệp bị từ chối.
            </dd>
          </div>
        </dl>
      </Card>

      {semesters.length > 0 && (
        <Card>
          <h2 className="text-sm font-semibold text-[var(--ink)]">Hiện trạng theo học kỳ</h2>
          <ul className="mt-3 divide-y divide-[var(--hairline-soft)]">
            {semesters.map((semester) => {
              const count = entriesBySemester.get(semester.id) ?? 0;
              return (
                <li key={semester.id} className="flex items-center justify-between gap-4 py-2.5">
                  <span className="text-sm text-[var(--ink)]">
                    {semester.year.name} · {semester.name}
                  </span>
                  <Badge tone={count > 0 ? "success" : "neutral"} size="sm">
                    {count > 0 ? `${count} tiết đã xếp` : "Chưa có dữ liệu"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {semesters.length === 0 && (
        <EmptyState
          title="Chưa có học kỳ"
          description="Thời khóa biểu luôn thuộc về một học kỳ cụ thể."
        />
      )}
    </div>
  );
}
