import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import argon2 from "argon2";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Actor } from "@ed4u/domain";
import { canLogin } from "@ed4u/domain";

const COOKIE = "ed4u_session";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function loginWithMemberCode(schoolMemberCode: string, password: string) {
  const membership = await db.schoolMembership.findFirst({
    where: { schoolMemberCode },
    include: { user: { include: { roles: true } }, class: true },
  });
  if (!membership || !canLogin(membership.membershipStatus)) {
    return { ok: false as const, error: "Mã thành viên hoặc mật khẩu không đúng." };
  }
  const valid = await argon2.verify(membership.user.passwordHash, password);
  if (!valid) {
    return { ok: false as const, error: "Mã thành viên hoặc mật khẩu không đúng." };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.session.create({
    data: { userId: membership.userId, tokenHash: hashToken(token), expiresAt },
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  const mustChange = membership.user.mustChangePassword && !env.DEMO_SKIP_PASSWORD_CHANGE;
  return { ok: true as const, mustChangePassword: mustChange };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await db.session.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete(COOKIE);
}

export async function currentActor(): Promise<Actor | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    include: {
      user: { include: { roles: true, memberships: { include: { class: true } } } },
    },
  });
  if (!session) return null;
  const membership = session.user.memberships[0];
  if (!membership) return null;
  return {
    userId: session.userId,
    tenantId: membership.tenantId,
    schoolMemberCode: membership.schoolMemberCode,
    memberType: membership.memberType,
    membershipStatus: membership.membershipStatus,
    roles: session.user.roles.map((r) => r.role),
    classId: membership.classId,
    grade: membership.class?.grade ?? null,
  };
}

/**
 * Id of the session backing this request, so the Security page can mark it and
 * refuse to let a user revoke the session they are currently using — signing
 * yourself out while auditing your own sessions is never the intent.
 */
export async function currentSessionId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findFirst({
    where: { tokenHash: hashToken(token), revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return session?.id ?? null;
}

export async function changePassword(userId: string, current: string, next: string) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false as const, error: "Không tìm thấy tài khoản." };
  const valid = await argon2.verify(user.passwordHash, current);
  if (!valid) return { ok: false as const, error: "Mật khẩu hiện tại không đúng." };
  if (next.length < 10) return { ok: false as const, error: "Mật khẩu mới phải từ 10 ký tự." };
  const passwordHash = await argon2.hash(next, { type: argon2.argon2id });
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } }),
    db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { ok: true as const };
}
