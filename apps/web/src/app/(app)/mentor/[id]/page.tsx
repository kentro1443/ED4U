import { db } from "@/lib/db";
import { PageHeader } from "@/components/PageHeader";
import { requireActor } from "@/lib/authz";
import { MENTOR_PROFILE_INCLUDE, toCanonicalMentor } from "@/lib/mentor/adapter";

/** Human-readable label for a credential domain we have checked. */
function credentialLine(domain: string, present: string | null): string {
  return present === null ? `${domain}: đã kiểm tra, không có chứng chỉ` : `${domain}: ${present}`;
}

export default async function MentorProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  const profile = await db.mentorProfile.findFirst({
    where: { id, tenantId: actor.tenantId },
    include: MENTOR_PROFILE_INCLUDE,
  });
  if (!profile) return <p>Không tìm thấy mentor.</p>;

  const canonical = toCanonicalMentor(profile);
  const checked = new Set(profile.credentialsCheckedDomains);

  // Only domains that were actually checked are shown. An unchecked domain is
  // absent from this list entirely — the page never claims a mentor lacks a
  // certificate nobody asked about.
  const credentials: string[] = [];
  if (checked.has("IELTS")) {
    credentials.push(
      credentialLine("IELTS", profile.ieltsOverall === null ? null : `${profile.ieltsOverall}`),
    );
  }
  if (checked.has("SAT")) {
    credentials.push(
      credentialLine("SAT", profile.satTotal === null ? null : `${profile.satTotal}`),
    );
  }
  if (checked.has("HSK")) {
    credentials.push(
      credentialLine("HSK", profile.hskLevel === null ? null : `HSK ${profile.hskLevel}`),
    );
  }

  return (
    <div>
      <PageHeader title={profile.user.fullName} description={profile.headline} />

      {"reasons" in canonical ? (
        <p role="alert" className="mb-4 rounded-lg border border-[var(--clay)] p-3 text-sm">
          Hồ sơ này chưa đủ dữ liệu để đưa vào Mentor Engine: {canonical.reasons.join(" ")}
        </p>
      ) : null}

      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="text-[var(--muted)]">Học phí</dt>
          <dd>{profile.pricePerHour.toLocaleString("vi-VN")} đ/giờ</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Chuyên môn</dt>
          <dd>{profile.expertise.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Lịch rảnh hằng tuần</dt>
          <dd>{profile.availability.join(", ") || "Chưa công bố"}</dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Chứng chỉ đã kiểm tra</dt>
          <dd>
            {credentials.length > 0 ? credentials.join(" · ") : "Chưa kiểm tra chứng chỉ nào"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Kinh nghiệm</dt>
          <dd>
            {profile.teachingExperienceMonths !== null
              ? `${profile.teachingExperienceMonths} tháng`
              : "Chưa có thông tin"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Đánh giá</dt>
          <dd>
            {profile.rating !== null
              ? `${profile.rating.toFixed(1)}★ · ${profile.ratingCount ?? 0} lượt`
              : "Chưa có đánh giá"}
          </dd>
        </div>
        <div>
          <dt className="text-[var(--muted)]">Trường</dt>
          <dd>{profile.school ?? "Chưa có thông tin"}</dd>
        </div>
      </dl>

      {profile.bio !== null ? <p className="mt-4 text-sm">{profile.bio}</p> : null}
    </div>
  );
}
