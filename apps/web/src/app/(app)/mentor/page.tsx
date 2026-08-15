import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";
import { MENTOR_PROFILE_INCLUDE } from "@/lib/mentor/adapter";

export default async function MentorPage() {
  const actor = await requireActor();
  const mentors = await db.mentorProfile.findMany({
    where: { tenantId: actor.tenantId, verified: true },
    include: MENTOR_PROFILE_INCLUDE,
    orderBy: { pricePerHour: "asc" },
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
            <Link href={`/mentor/${m.id}`} className="font-medium hover:underline">
              {m.user.fullName}
            </Link>
            <p className="text-sm text-[var(--muted)]">{m.headline}</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {m.pricePerHour.toLocaleString("vi-VN")} đ/giờ
              {/* Rating is genuinely optional: a new mentor has none, and a
                  placeholder would misrepresent them. */}
              {m.rating !== null ? ` · ${m.rating.toFixed(1)}★ (${m.ratingCount ?? 0})` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
