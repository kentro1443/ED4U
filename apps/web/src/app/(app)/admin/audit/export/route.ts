import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/auth";
import { can } from "@ed4u/domain";
import { loadUserDirectory } from "@/lib/userDirectory";

/**
 * CSV export of the audit log.
 *
 * Compliance review happens in a spreadsheet, not in a web list, so the log has
 * to leave the product. The export re-derives the actor and re-checks
 * `audit.read` rather than trusting that the page linking here was guarded, and
 * it applies the same filters as the on-screen view so what an administrator
 * exports is what they were looking at.
 */

const MAX_ROWS = 10_000;

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  // Prefix formula-leading characters so a spreadsheet treats them as text.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${guarded.replaceAll('"', '""')}"`;
}

export async function GET(request: NextRequest) {
  const actor = await currentActor();
  if (!actor) {
    return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  }
  if (!can(actor, "audit.read")) {
    return NextResponse.json({ error: "Không đủ quyền." }, { status: 403 });
  }

  const url = request.nextUrl;
  const action = url.searchParams.get("action");
  const entity = url.searchParams.get("entity");
  const q = url.searchParams.get("q")?.trim().slice(0, 120);

  const where: Prisma.AuditEventWhereInput = {
    tenantId: actor.tenantId,
    ...(action && action !== "ALL" ? { action } : {}),
    ...(entity && entity !== "ALL" ? { entityType: entity } : {}),
    ...(q
      ? {
          OR: [
            { action: { contains: q, mode: "insensitive" } },
            { entityType: { contains: q, mode: "insensitive" } },
            { entityId: { contains: q, mode: "insensitive" } },
            { requestId: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [tenant, events] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: actor.tenantId },
      select: { timezone: true, slug: true },
    }),
    db.auditEvent.findMany({ where, orderBy: { timestamp: "desc" }, take: MAX_ROWS }),
  ]);

  const directory = await loadUserDirectory(
    actor.tenantId,
    events.map((event) => event.actorId),
  );

  const localFormatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: tenant.timezone,
    dateStyle: "short",
    timeStyle: "medium",
  });

  const header = [
    "thoi_gian_truong",
    "thoi_gian_utc",
    "mui_gio",
    "nguoi_thuc_hien",
    "ma_thanh_vien",
    "hanh_dong",
    "loai_doi_tuong",
    "ma_doi_tuong",
    "request_id",
    "truoc",
    "sau",
  ].join(",");

  const rows = events.map((event) => {
    const entry = event.actorId ? directory.get(event.actorId) : undefined;
    return [
      csvCell(localFormatter.format(event.timestamp)),
      csvCell(event.timestamp.toISOString()),
      csvCell(tenant.timezone),
      csvCell(event.actorId ? (entry?.fullName ?? "Tài khoản đã bị xóa") : "Hệ thống"),
      csvCell(entry?.schoolMemberCode ?? ""),
      csvCell(event.action),
      csvCell(event.entityType),
      csvCell(event.entityId),
      csvCell(event.requestId),
      csvCell(event.beforeJson ? JSON.stringify(event.beforeJson) : ""),
      csvCell(event.afterJson ? JSON.stringify(event.afterJson) : ""),
    ].join(",");
  });

  // BOM so Excel opens Vietnamese diacritics as UTF-8 rather than mojibake.
  const body = `﻿${[header, ...rows].join("\r\n")}\r\n`;
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ed4u-audit-${tenant.slug}-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
