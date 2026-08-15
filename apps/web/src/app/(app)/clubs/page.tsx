import { currentActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";

export default async function ClubsPage() {
  const actor = await currentActor();
  if (!actor) return null;
  const clubs = await db.club.findMany({
    where: { tenantId: actor.tenantId },
    include: { members: true, finance: true },
  });
  return (
    <div>
      <PageHeader
        title="Câu lạc bộ"
        description="Sổ sách thu/chi — không phải ví thanh toán. Khoản đã duyệt là bất biến."
      />
      <ul className="space-y-3">
        {clubs.map((c) => (
          <li key={c.id} className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-4">
            <p className="font-medium">{c.name}</p>
            <p className="text-sm">
              {c.status} · {c.members.length} thành viên · {c.finance.length} bút toán
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
