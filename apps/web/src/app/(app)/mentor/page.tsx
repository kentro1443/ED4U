import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/DataDisplay";
import { Icons } from "@/components/ui/icons";
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
    <div className="space-y-6">
      <PageHeader
        title="Mentor"
        description="Gợi ý từ Mentor Intelligence Engine — đề xuất khách quan, không đặt chỗ tự động."
        actions={
          <LinkButton href="/mentor/match-space" variant="primary" size="md">
            <Icons.matchSpace className="h-4 w-4 mr-1" />
            Mở Match Space
          </LinkButton>
        }
      />

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mentors.map((m) => (
          <li key={m.id}>
            <Card
              variant="interactive"
              className="p-5 flex flex-col justify-between space-y-4 h-full"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.user.fullName} size="md" />
                    <div>
                      <Link
                        href={`/mentor/${m.id}`}
                        className="font-semibold text-[var(--ink)] hover:underline block leading-snug"
                      >
                        {m.user.fullName}
                      </Link>
                      <p className="text-xs text-[var(--muted)]">{m.school ?? "Cựu học sinh"}</p>
                    </div>
                  </div>
                  {m.verified && (
                    <Badge tone="success" size="sm">
                      Đã xác minh
                    </Badge>
                  )}
                </div>

                <p className="text-xs md:text-sm text-[var(--body)] line-clamp-2 leading-relaxed">
                  {m.headline}
                </p>

                {m.expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {m.expertise.slice(0, 3).map((exp) => (
                      <Badge key={exp} tone="neutral" size="sm">
                        {exp}
                      </Badge>
                    ))}
                    {m.expertise.length > 3 && (
                      <span className="text-[11px] text-[var(--muted)] self-center">
                        +{m.expertise.length - 3}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--hairline-soft)] pt-3 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-[var(--ink)] text-sm">
                    {m.pricePerHour.toLocaleString("vi-VN")} đ
                  </span>
                  <span className="text-[var(--muted)]"> / giờ</span>
                </div>
                <div>
                  {m.rating !== null ? (
                    <span className="font-semibold text-amber-800 flex items-center gap-1">
                      ★ {m.rating.toFixed(1)}{" "}
                      <span className="text-[var(--muted)] font-normal">
                        ({m.ratingCount ?? 0})
                      </span>
                    </span>
                  ) : (
                    <span className="text-[var(--muted)]">Chưa có đánh giá</span>
                  )}
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
