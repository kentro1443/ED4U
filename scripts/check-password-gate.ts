import argon2 from "argon2";
import { PrismaClient } from "../apps/web/src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({
    connectionString:
      process.env.DATABASE_URL ?? "postgresql://ed4u:ed4u_local@127.0.0.1:5434/ed4u",
  }),
});

async function main() {
  const membership = await db.schoolMembership.findFirst({
    where: { schoolMemberCode: "HS000001" },
    include: { user: true },
  });
  const ok = !!(membership && (await argon2.verify(membership.user.passwordHash, "TempPass1!")));
  console.log(
    JSON.stringify(
      {
        studentCode: membership?.schoolMemberCode,
        mustChangePassword: membership?.user.mustChangePassword,
        argon2ok: ok,
        gate: membership?.user.mustChangePassword && ok ? "FORCED_PASSWORD_CHANGE" : "UNEXPECTED",
      },
      null,
      2,
    ),
  );
  await db.$disconnect();
}

void main();
