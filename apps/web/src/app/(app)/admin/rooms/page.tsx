import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireRoute } from "@/lib/authz";
import { parseListParams, listSkip, type RawSearchParams } from "@/lib/listParams";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Badge, StatusBadge } from "@/components/ui/Badge";
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
import { Icons } from "@/components/ui/icons";
import { CreateRoomButton, RoomStatusActions } from "./RoomControls";

export const metadata: Metadata = { title: "Phòng & tiện ích" };

const PER_PAGE = 25;

export default async function AdminRoomsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const actor = await requireRoute("/admin/rooms");
  const rawParams = await searchParams;
  const params = parseListParams(rawParams, { facets: ["status", "type"], perPage: PER_PAGE });

  const where: Prisma.RoomWhereInput = {
    tenantId: actor.tenantId,
    ...(params.filters.status
      ? { status: params.filters.status as "ACTIVE" | "MAINTENANCE" | "DISABLED" }
      : {}),
    ...(params.filters.type ? { roomTypeId: params.filters.type } : {}),
    ...(params.q
      ? {
          OR: [
            { code: { contains: params.q, mode: "insensitive" } },
            { name: { contains: params.q, mode: "insensitive" } },
            { building: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [types, features, total, rooms, statusCounts] = await Promise.all([
    db.roomType.findMany({ where: { tenantId: actor.tenantId }, orderBy: { name: "asc" } }),
    db.roomFeatureDefinition.findMany({
      where: { tenantId: actor.tenantId },
      include: { _count: { select: { values: true } } },
      orderBy: { name: "asc" },
    }),
    db.room.count({ where }),
    db.room.findMany({
      where,
      include: {
        roomType: { select: { name: true } },
        features: { include: { feature: { select: { code: true, name: true } } } },
      },
      orderBy: { code: "asc" },
      skip: listSkip(params),
      take: params.perPage,
    }),
    db.room.groupBy({
      by: ["status"],
      where: { tenantId: actor.tenantId },
      _count: { status: true },
    }),
  ]);

  const facets: Facet[] = [
    {
      name: "status",
      label: "Trạng thái",
      options: [
        { value: "ACTIVE", label: "Đang dùng" },
        { value: "MAINTENANCE", label: "Bảo trì" },
        { value: "DISABLED", label: "Ngừng sử dụng" },
      ].map((option) => ({
        value: option.value,
        label: `${option.label} (${
          statusCounts.find((row) => row.status === option.value)?._count.status ?? 0
        })`,
      })),
    },
    {
      name: "type",
      label: "Loại phòng",
      options: types.map((type) => ({ value: type.id, label: type.name })),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Phòng & tiện ích"
        description="Danh mục phòng là dữ liệu đầu vào của Facility Engine. Tiện ích là định nghĩa cấu hình dùng chung, không phải một cột cố định trên bảng phòng."
        badge={<Badge tone="brand">rooms.manage</Badge>}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/rooms/schedule"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--hairline)] px-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <Icons.calendar className="h-4 w-4" aria-hidden="true" />
              Lịch phòng
            </Link>
            <CreateRoomButton
              roomTypes={types.map((type) => ({ id: type.id, label: type.name }))}
            />
          </div>
        }
      />

      <Card className="space-y-4 p-4 md:p-5">
        <ListToolbar
          basePath="/admin/rooms"
          searchParams={rawParams}
          params={params}
          facets={facets}
          searchPlaceholder="Tìm theo mã, tên hoặc tòa nhà…"
          total={total}
          shown={rooms.length}
        />

        {rooms.length === 0 ? (
          <EmptyState
            title="Không có phòng nào khớp"
            description={
              total === 0
                ? "Thêm phòng đầu tiên để Facility Engine có dữ liệu lập kế hoạch."
                : "Thử bỏ bớt bộ lọc hoặc tìm bằng từ khóa khác."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mã</TableHead>
                <TableHead>Tên phòng</TableHead>
                <TableHead className="hidden md:table-cell">Loại</TableHead>
                <TableHead className="hidden lg:table-cell">Vị trí</TableHead>
                <TableHead className="text-right">Sức chứa</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="hidden xl:table-cell">Tiện ích</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) => (
                <TableRow key={room.id}>
                  <TableCell className="font-mono text-xs font-semibold">{room.code}</TableCell>
                  <TableCell className="font-medium">{room.name}</TableCell>
                  <TableCell className="hidden text-xs text-[var(--muted)] md:table-cell">
                    {room.roomType.name}
                  </TableCell>
                  <TableCell className="hidden text-xs text-[var(--muted)] lg:table-cell">
                    {room.building} · tầng {room.floor}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{room.capacity}</TableCell>
                  <TableCell>
                    <StatusBadge status={room.status} />
                  </TableCell>
                  <TableCell className="hidden xl:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {room.features.length === 0 ? (
                        <span className="text-xs text-[var(--muted)]">—</span>
                      ) : (
                        room.features.map((value) => (
                          <Badge key={value.id} tone="outline" size="sm">
                            {value.feature.name}: {value.value}
                          </Badge>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RoomStatusActions
                      roomId={room.id}
                      roomLabel={`${room.code} · ${room.name}`}
                      status={room.status}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Pagination
          basePath="/admin/rooms"
          searchParams={rawParams}
          params={params}
          total={total}
        />
      </Card>

      <Card>
        <SectionHeader
          title="Định nghĩa tiện ích"
          description="Mỗi tiện ích là một thuộc tính có kiểu dữ liệu, được gán giá trị riêng cho từng phòng và được Facility Engine đọc như ràng buộc cứng."
        />
        {features.length === 0 ? (
          <EmptyState
            title="Chưa có định nghĩa tiện ích"
            description="Tiện ích được khai báo ở cấp trường rồi gán giá trị cho từng phòng."
          />
        ) : (
          <ul className="divide-y divide-[var(--hairline-soft)]">
            {features.map((feature) => (
              <li key={feature.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)]">{feature.name}</p>
                  <p className="font-mono text-xs text-[var(--muted)]">
                    {feature.code} · {feature.dataType}
                  </p>
                </div>
                <Badge tone="neutral" size="sm">
                  {feature._count.values} phòng có giá trị
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
