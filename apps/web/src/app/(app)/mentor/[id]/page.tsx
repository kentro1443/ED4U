import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/DataDisplay";
import { Alert, EmptyState } from "@/components/ui/Feedback";
import { requireActor } from "@/lib/authz";
import { can } from "@ed4u/domain";
import { MENTOR_PROFILE_INCLUDE, toCanonicalMentor } from "@/lib/mentor/adapter";
import { MentorBookingCard } from "@/features/mentor/MentorBookingCard";
import { availabilityLabel, mentorSkillLabel } from "@/lib/mentor/presentation";

function credentialLine(domain: string, present: string | null): string {
  return present === null ? `${domain}: đã kiểm tra, không có chứng chỉ` : `${domain}: ${present}`;
}

export default async function MentorProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const actor = await requireActor();
  const { id } = await params;
  const { run: runId } = await searchParams;

  const [profile, tenant] = await Promise.all([
    db.mentorProfile.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: MENTOR_PROFILE_INCLUDE,
    }),
    db.tenant.findUnique({ where: { id: actor.tenantId }, select: { timezone: true } }),
  ]);

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Hồ sơ Mentor" />
        <EmptyState
          title="Không tìm thấy mentor"
          description="Hồ sơ mentor không tồn tại hoặc không thuộc trường của bạn."
        />
      </div>
    );
  }

  const canonical = toCanonicalMentor(profile);
  const canBookMentor =
    can(actor, "mentor.book") &&
    actor.memberType === "STUDENT" &&
    actor.membershipStatus === "ACTIVE";
  const checked = new Set(profile.credentialsCheckedDomains);

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
    <div className="space-y-6">
      <PageHeader
        title={profile.user.fullName}
        description={profile.headline ?? "Mentor cựu học sinh"}
        breadcrumbs={[{ label: "Mentor", href: "/mentor" }, { label: profile.user.fullName }]}
        badge={profile.verified ? <Badge tone="success">Đã xác minh</Badge> : undefined}
      />

      {"reasons" in canonical ? (
        <Alert tone="warning" title="Hồ sơ chưa đủ dữ liệu cho Mentor Engine">
          {canonical.reasons.join(" ")}
        </Alert>
      ) : null}

      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        {/* Profile Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Thông tin chuyên môn & Giảng dạy</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Học phí
                  </dt>
                  <dd className="mt-1 font-bold text-base text-[var(--ink)]">
                    {profile.pricePerHour.toLocaleString("vi-VN")} đ/giờ
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Đánh giá
                  </dt>
                  <dd className="mt-1 font-medium">
                    {profile.rating !== null
                      ? `${profile.rating.toFixed(1)}★ · ${profile.ratingCount ?? 0} lượt`
                      : "Chưa có đánh giá"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Kinh nghiệm
                  </dt>
                  <dd className="mt-1">
                    {profile.teachingExperienceMonths !== null
                      ? `${profile.teachingExperienceMonths} tháng`
                      : "Chưa có thông tin"}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Trường / Đơn vị
                  </dt>
                  <dd className="mt-1">{profile.school ?? "Chưa có thông tin"}</dd>
                </div>

                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Chuyên môn
                  </dt>
                  <dd className="mt-1 font-medium">
                    {profile.expertise.map(mentorSkillLabel).join(", ")}
                  </dd>
                </div>

                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Lịch rảnh hằng tuần
                  </dt>
                  <dd className="mt-1 text-[var(--body)]">
                    {profile.availability.map(availabilityLabel).join(" · ") || "Chưa công bố"}
                  </dd>
                </div>

                <div className="sm:col-span-2">
                  <dt className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                    Chứng chỉ đã kiểm tra
                  </dt>
                  <dd className="mt-1 font-medium text-[var(--ink)]">
                    {credentials.length > 0
                      ? credentials.join(" · ")
                      : "Chưa kiểm tra chứng chỉ nào"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {profile.bio !== null && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Giới thiệu bản thân</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-[var(--body)]">{profile.bio}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Booking Card & Mentor Avatar Summary */}
        <div className="space-y-6">
          <Card className="text-center p-6 space-y-4">
            <Avatar name={profile.user.fullName} size="lg" className="mx-auto h-16 w-16 text-xl" />
            <div>
              <h3 className="font-bold text-base text-[var(--ink)]">{profile.user.fullName}</h3>
              <p className="text-xs text-[var(--muted)] mt-0.5">{profile.headline}</p>
            </div>
            <div className="pt-2 border-t border-[var(--hairline-soft)] text-xs text-[var(--muted)]">
              Thành viên thuộc mạng lưới Mentor cựu học sinh ED4U
            </div>
          </Card>

          {/* Interactive Live Slot Booking — active students only. */}
          {canBookMentor ? (
            <MentorBookingCard
              mentorId={profile.id}
              mentorName={profile.user.fullName}
              pricePerHour={profile.pricePerHour}
              availability={profile.availability}
              recommendationRunId={runId}
              verified={profile.verified}
              timeZone={tenant?.timezone ?? "Asia/Ho_Chi_Minh"}
            />
          ) : (
            <Alert tone="info" title="Xem hồ sơ Mentor">
              Chức năng đặt lịch chỉ dành cho học sinh đang theo học và có quyền đặt Mentor.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
