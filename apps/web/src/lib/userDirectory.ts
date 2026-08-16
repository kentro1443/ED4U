import "server-only";
import { db } from "@/lib/db";

/**
 * Resolves opaque user ids into the identity a human recognises.
 *
 * `AuditEvent.actorId`, `RoomRequest.requestedBy` and `Approval.requestedBy`
 * store bare user ids rather than relations, so pages that show *who did this*
 * previously printed a UUID. Rendering a UUID where a person belongs is a
 * product defect, not a cosmetic one: an approver authorises a request based on
 * who made it. This resolves them in one batched query per page.
 */

export interface DirectoryEntry {
  userId: string;
  fullName: string;
  schoolMemberCode: string | null;
}

export type UserDirectory = ReadonlyMap<string, DirectoryEntry>;

export async function loadUserDirectory(
  tenantId: string,
  userIds: readonly (string | null | undefined)[],
): Promise<UserDirectory> {
  const unique = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();

  const users = await db.user.findMany({
    where: { id: { in: unique }, tenantId },
    select: {
      id: true,
      fullName: true,
      memberships: {
        where: { tenantId },
        select: { schoolMemberCode: true },
        take: 1,
      },
    },
  });

  return new Map(
    users.map((u) => [
      u.id,
      {
        userId: u.id,
        fullName: u.fullName,
        schoolMemberCode: u.memberships[0]?.schoolMemberCode ?? null,
      },
    ]),
  );
}

/**
 * Display name for a user id. An id that resolves to nobody in this tenant is
 * reported as such rather than leaked to the screen — a deleted account or a
 * cross-tenant id is information the reader cannot act on, and printing the raw
 * id would put an internal identifier in front of a student.
 */
export function displayUser(directory: UserDirectory, userId: string | null | undefined): string {
  if (!userId) return "Hệ thống";
  const entry = directory.get(userId);
  if (!entry) return "Người dùng không còn hoạt động";
  return entry.schoolMemberCode ? `${entry.fullName} · ${entry.schoolMemberCode}` : entry.fullName;
}

export function displayUserName(
  directory: UserDirectory,
  userId: string | null | undefined,
): string {
  if (!userId) return "Hệ thống";
  return directory.get(userId)?.fullName ?? "Người dùng không còn hoạt động";
}
