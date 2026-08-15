import { createHash } from "node:crypto";
import type { PrismaClient } from "@/generated/prisma/client";

const WINDOW_MS = 15 * 60_000;
const PAIR_MAX_FAILURES = 5;
const IP_MAX_FAILURES = 20;
const PAIR_LOCK_MS = 15 * 60_000;
const IP_LOCK_MS = 30 * 60_000;

function hashKey(scope: "pair" | "ip", ip: string, code?: string): string {
  return createHash("sha256")
    .update(`${scope}:${ip}:${code?.trim().toUpperCase() ?? ""}`)
    .digest("hex");
}

function keys(ip: string, code: string) {
  return { pair: hashKey("pair", ip, code), ip: hashKey("ip", ip) };
}

export function createLoginThrottle(client: PrismaClient) {
  async function ensureRows(pairKey: string, ipKey: string) {
    const now = new Date();
    await client.authThrottle.createMany({
      data: [
        { key: pairKey, failures: 0, windowStartedAt: now },
        { key: ipKey, failures: 0, windowStartedAt: now },
      ],
      skipDuplicates: true,
    });
  }

  async function recordFailureForKey(key: string, maxFailures: number, lockMs: number) {
    await client.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ key: string; failures: number; windowStartedAt: Date; lockedUntil: Date | null }>
      >`
        SELECT "key", "failures", "windowStartedAt", "lockedUntil"
        FROM "AuthThrottle"
        WHERE "key"=${key}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) return;
      const now = new Date();
      const windowExpired = now.getTime() - row.windowStartedAt.getTime() > WINDOW_MS;
      const failures = windowExpired ? 1 : row.failures + 1;
      await tx.authThrottle.update({
        where: { key },
        data: {
          failures,
          windowStartedAt: windowExpired ? now : row.windowStartedAt,
          lockedUntil: failures >= maxFailures ? new Date(now.getTime() + lockMs) : null,
        },
      });
    });
  }

  return {
    async assertLoginAllowed(ip: string, code: string): Promise<void> {
      const bucket = keys(ip, code);
      await ensureRows(bucket.pair, bucket.ip);
      const rows = await client.authThrottle.findMany({
        where: { key: { in: [bucket.pair, bucket.ip] } },
      });
      const now = Date.now();
      if (rows.some((row) => row.lockedUntil && row.lockedUntil.getTime() > now)) {
        throw new Error(
          "Đăng nhập tạm thời bị giới hạn do nhiều lần thử thất bại. Vui lòng thử lại sau.",
        );
      }
    },

    async recordLoginFailure(ip: string, code: string): Promise<void> {
      const bucket = keys(ip, code);
      await ensureRows(bucket.pair, bucket.ip);
      await recordFailureForKey(bucket.pair, PAIR_MAX_FAILURES, PAIR_LOCK_MS);
      await recordFailureForKey(bucket.ip, IP_MAX_FAILURES, IP_LOCK_MS);
    },

    async recordLoginSuccess(ip: string, code: string): Promise<void> {
      const bucket = keys(ip, code);
      await client.authThrottle.updateMany({
        where: { key: { in: [bucket.pair, bucket.ip] } },
        data: { failures: 0, windowStartedAt: new Date(), lockedUntil: null },
      });
    },

    async pruneLoginThrottle(before: Date): Promise<number> {
      const result = await client.authThrottle.deleteMany({
        where: { updatedAt: { lt: before }, lockedUntil: { lt: new Date() } },
      });
      return result.count;
    },
  };
}
