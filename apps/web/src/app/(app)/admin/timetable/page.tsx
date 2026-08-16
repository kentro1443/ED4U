import type { Metadata } from "next";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { parseListParams, listSkip, type RawSearchParams } from "@/lib/listParams";
import { loadUserDirectory, displayUserName } from "@/lib/userDirectory";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/Feedback";
import { ListToolbar, Pagination, type Facet } from "@/components/ui/ListToolbar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/DataTable";

export const metadata: Metadata = { title: "Thời khóa biểu" };

const PER_PAGE = 25;

const WEEKDAY_LABELS: Record<string, string> = {
  MON: "Thứ Hai",
  TUE: "Thứ Ba",
  WED: "Thứ Tư",
  THU: "Thứ Năm",
  FRI: "Thứ Sáu",
};

export default async function TimetableAdminPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requireRoute("/admin/timetable");
  const rawParams = await searchParams;
  const params = parseListParams(rawParams, { facets: ["weekday", "class"], perPage: PER_PAGE });

  const where: Prisma.TimetableEntryWhereInput = {
    tenantId: actor.tenantId,
    ...(params.filters.weekday
      ? { weekday: params.filters.weekday as "MON" | "TUE" | "WED" | "THU" | "FRI" }
      : {}),
    ...(params.filters.class ? { classId: params.filters.class } : {}),
    ...(params.q
      ? {
          OR: [
            { class: { code: { contains: params.q, mode: "insensitive" } } },
            { subject: { name: { contains: params.q, mode: "insensitive" } } },
            { subject: { code: { contains: params.q, mode: "insensitive" } } },
            { room: { code: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [periods, classes, total, entries] = await Promise.all([
    db.academicPeriod.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: { sortOrder: "asc" },
    }),
    db.class.findMany({
      where: { tenantId: actor.tenantId },
      select: { id: true, code: true, name: true },
      orderBy: { code: "asc" },
    }),
    db.timetableEntry.count({ where }),
    db.timetableEntry.findMany({
      where,
      include: {
        class: { select: { code: true, name: true } },
        subject: { select: { code: true, name: true } },
        room: { select: { code: true, name: true } },
        period: { select: { code: true, startTime: true, endTime: true, sortOrder: true } },
      },
      orderBy: [{ weekday: "asc" }, { period: { sortOrder: "asc" } }, { classId: "asc" }],
      skip: listSkip(params),
      take: params.perPage,
    }),
  ]);

  const directory = await loadUserDirectory(
    actor.tenantId,
    entries.map((entry) => entry.teacherId),
  );

  const facets: Facet[] = [
    {
      name: "weekday",
      label: "Thứ",
      options: Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({ value, label })),
    },
    {
      name: "class",
      label: "Lớp",
      options: classes.map((klass) => ({ value: klass.id, label: klass.code })),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Thời khóa biểu"
        description="Nguồn sự thật cho lịch học. Lịch là phép chiếu trên dữ liệu này — không có bản sao nào được tạo trong CalendarEvent."
        badge={<Badge tone="brand">timetable.edit</Badge>}
      />

      <Card>
        <SectionHeader
          title="Tiết học trong ngày"
          description="Khung tiết do trường cấu hình, dùng chung cho toàn bộ thời khóa biểu và cho việc tính chiếm dụng phòng."
        />
        {periods.length === 0 ? (
          <EmptyState
            title="Chưa cấu hình tiết học"
            description="Thời khóa biểu không thể tồn tại nếu chưa có khung tiết."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {periods.map((period) => (
              <div
                key={period.id}
                className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-2"
              >
                <p className="font-mono text-xs font-semibold text-[var(--ink)]">{period.code}</p>
                <p className="text-xs tabular-nums text-[var(--muted)]">
                  {period.startTime}–{period.endTime}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4 md:p-5">
        <SectionHeader
          title="Tiết đã xếp"
          description="Toàn bộ tiết học đang áp dụng, đọc trực tiếp từ cơ sở dữ liệu."
        />
        <ListToolbar
          basePath="/admin/timetable"
          searchParams={rawParams}
          params={params}
          facets={facets}
          searchPlaceholder="Tìm theo lớp, môn hoặc phòng…"
          total={total}
          shown={entries.length}
        />

        {entries.length === 0 ? (
          <EmptyState
            title="Không có tiết học nào khớp"
            description={
              total === 0
                ? "Thời khóa biểu trống. ADMIN_IT có thể nhập từ tệp CSV ở trang Import TKB."
                : "Thử bỏ bớt bộ lọc hoặc tìm bằng từ khóa khác."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thứ</TableHead>
                <TableHead>Tiết</TableHead>
                <TableHead>Lớp</TableHead>
                <TableHead>Môn</TableHead>
                <TableHead className="hidden lg:table-cell">Giáo viên</TableHead>
                <TableHead>Phòng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-xs">
                    {WEEKDAY_LABELS[entry.weekday] ?? entry.weekday}
                  </TableCell>
                  <TableCell className="text-xs tabular-nums">
                    <span className="font-mono font-semibold">{entry.period.code}</span>
                    <span className="ml-1.5 text-[var(--muted)]">
                      {entry.period.startTime}–{entry.period.endTime}
                    </span>
                  </TableCell>
                  <TableCell className="font-medium">{entry.class.code}</TableCell>
                  <TableCell className="text-xs">
                    {entry.subject.name}
                    <span className="ml-1.5 font-mono text-[var(--muted)]">
                      {entry.subject.code}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-xs lg:table-cell">
                    {displayUserName(directory, entry.teacherId)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{entry.room.code}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination
          basePath="/admin/timetable"
          searchParams={rawParams}
          params={params}
          total={total}
        />
      </Card>
    </div>
  );
}
