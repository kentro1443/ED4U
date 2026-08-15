import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";

export default async function MentorPage() {
  const actor = await requireActor();
  const mentors = await db.mentorProfile.findMany({
    where: { tenantId: actor.tenantId, verified: true },
    take: 12,
  });
  return (
    <div>
      <PageHeader
        title="Mentor"
        description="Gợi ý từ Mentor Intelligence Engine — đề xuất, không đặt chỗ."
      />
      <Link
        href="/mentor/match-space"
        className="rounded-full bg-[var(--pine)] px-4 py-2 text-sm text-white"
      >
        Mở Match Space
      </Link>
      <ul className="mt-6 grid gap-3 md:grid-cols-2">
        {mentors.map((m) => (
          <li key={m.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <p className="font-medium">{m.headline}</p>
            <p className="text-sm text-[var(--muted)]">
              {m.pricePerHour.toLocaleString("vi-VN")} đ/giờ
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
