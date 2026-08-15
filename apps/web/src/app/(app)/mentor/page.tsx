import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton, Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/DataDisplay";
import { EmptyState } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { requireActor } from "@/lib/authz";
import { MENTOR_PROFILE_INCLUDE } from "@/lib/mentor/adapter";
import { MentorSearchComposer } from "@/features/mentor/MentorSearchComposer";
import { parseMentorMatchPayload, parseMentorRunSnapshot } from "@/lib/mentor/schemas";
import { mentorSkillLabel } from "@/lib/mentor/presentation";

export default async function MentorPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    domain?: string;
    verified?: string;
    maxPrice?: string;
    style?: string;
    language?: string;
  }>;
}) {
  const actor = await requireActor();
  const { q, domain, verified, maxPrice, style, language } = await searchParams;

  // 1. Fetch recent owned recommendation runs (3-5 items) for student
  const recentRuns = await db.mentorRecommendationRun.findMany({
    where: {
      request: {
        studentId: actor.userId,
        tenantId: actor.tenantId,
      },
    },
    include: { request: true },
    orderBy: { createdAt: "desc" },
    take: 4,
  });

  const parsedRecentRuns = recentRuns
    .map((r) => {
      const payload = parseMentorMatchPayload(r.request.payload);
      const snapshot = parseMentorRunSnapshot(r.result);
      if (!payload || !snapshot) return null;
      const topMentorId = snapshot.result.recommendations[0]?.mentorId;
      const topMentorDisplay = topMentorId
        ? snapshot.mentorDisplaySnapshot.find((m) => m.mentorId === topMentorId)
        : null;
      const topScore = snapshot.result.recommendations[0]?.matchScore;

      return {
        runId: r.id,
        createdAt: r.createdAt,
        domain: payload.canonicalRequest.goal.domain,
        focusSkills: payload.canonicalRequest.goal.focusSkills,
        topMentorName: topMentorDisplay?.fullName ?? "—",
        topScore: topScore ?? 0,
      };
    })
    .filter(Boolean);

  // 2. Fetch manual mentor candidate profiles with URL filter support
  const maxPriceNum = maxPrice ? Number(maxPrice) : undefined;
  const verifiedBool = verified === "true" ? true : undefined;

  const whereClause: Record<string, unknown> = {
    tenantId: actor.tenantId,
    user: {
      roles: { some: { role: "MENTOR" } },
      memberships: { some: { membershipStatus: "GRADUATED" } },
    },
  };

  if (verifiedBool !== undefined) {
    whereClause.verified = verifiedBool;
  }
  if (maxPriceNum !== undefined) {
    whereClause.pricePerHour = { lte: maxPriceNum };
  }
  if (style) {
    whereClause.teachingStyles = { has: style.toUpperCase() };
  }
  if (language) {
    whereClause.languages = { has: language.toUpperCase() };
  }

  const allProfiles = await db.mentorProfile.findMany({
    where: whereClause,
    include: MENTOR_PROFILE_INCLUDE,
    orderBy: { pricePerHour: "asc" },
  });

  // In-memory filter for domain and text query
  const filteredMentors = allProfiles.filter((m) => {
    if (q) {
      const query = q.toLowerCase();
      const matchName = m.user.fullName.toLowerCase().includes(query);
      const matchHeadline = m.headline?.toLowerCase().includes(query) ?? false;
      const matchExpertise = m.expertise.some((e) => e.toLowerCase().includes(query));
      if (!matchName && !matchHeadline && !matchExpertise) return false;
    }

    if (domain && domain !== "ALL") {
      if (
        domain === "IELTS" &&
        m.ieltsOverall === null &&
        !m.credentialsCheckedDomains.includes("IELTS")
      ) {
        return false;
      }
      if (domain === "SAT" && m.satTotal === null && !m.credentialsCheckedDomains.includes("SAT")) {
        return false;
      }
      if (domain === "HSK" && m.hskLevel === null && !m.credentialsCheckedDomains.includes("HSK")) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mentor"
        description="Tìm mentor phù hợp với mục tiêu, lịch học và ngân sách của bạn từ Mentor Intelligence Engine."
        actions={
          <LinkButton href="/mentor/match-space" variant="secondary" size="md">
            <Icons.matchSpace className="h-4 w-4 mr-1.5" />
            Mở Match Space
          </LinkButton>
        }
      />

      {/* Intelligence Path: Search Composer */}
      <section className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
          Tìm kiếm thông minh qua ngôn ngữ tự nhiên
        </h2>
        <MentorSearchComposer />
      </section>

      {/* Recent Recommendation Runs */}
      {parsedRecentRuns.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)]">
              Lịch sử tìm kiếm gần đây của bạn
            </h2>
            <Link
              href="/mentor/match-space"
              className="text-xs text-[var(--primary)] font-medium hover:underline flex items-center gap-1"
            >
              Xem không gian gần nhất →
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {parsedRecentRuns.map((run) => (
              <Card
                key={run!.runId}
                variant="interactive"
                className="p-4 flex flex-col justify-between space-y-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Badge tone="brand" size="sm">
                      {run!.domain}
                    </Badge>
                    <span className="text-[11px] text-[var(--muted)]">
                      {new Date(run!.createdAt).toLocaleDateString("vi-VN")}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-[var(--ink)] line-clamp-1">
                    Gợi ý #1: {run!.topMentorName}
                  </p>
                  <p className="text-[11px] text-[var(--muted)]">
                    Điểm phù hợp:{" "}
                    <span className="font-semibold text-[var(--ink)]">{run!.topScore}/100</span>
                  </p>
                </div>
                <LinkButton
                  href={`/mentor/match-space?run=${run!.runId}`}
                  variant="outline"
                  size="sm"
                  className="w-full text-center text-xs"
                >
                  Mở kết quả Match Space
                </LinkButton>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Manual Discovery Section */}
      <section className="space-y-4 pt-4 border-t border-[var(--hairline)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--ink)]">Danh bạ Mentor trường</h2>
            <p className="text-xs text-[var(--muted)]">
              Duyệt thủ công toàn bộ danh sách {filteredMentors.length} mentor cựu học sinh đã xác
              thực.
            </p>
          </div>

          {/* Manual Filter Controls Form */}
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Tìm theo tên, chuyên môn..."
              aria-label="Tìm mentor theo tên hoặc chuyên môn"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-3 py-1.5 text-xs text-[var(--ink)] placeholder:text-[var(--muted)] focus:bg-[var(--canvas)] focus:outline-none focus:border-[var(--primary)]"
            />
            <select
              name="domain"
              defaultValue={domain ?? "ALL"}
              aria-label="Môn hoặc chứng chỉ"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:bg-[var(--canvas)] focus:outline-none"
            >
              <option value="ALL">Tất cả môn</option>
              <option value="IELTS">IELTS</option>
              <option value="SAT">SAT</option>
              <option value="HSK">HSK</option>
            </select>
            <input
              type="number"
              name="maxPrice"
              defaultValue={maxPrice}
              min="0"
              step="50000"
              placeholder="Giá tối đa"
              aria-label="Học phí tối đa"
              className="w-28 rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--ink)] focus:bg-[var(--canvas)] focus:outline-none focus:border-[var(--primary)]"
            />
            <select
              name="verified"
              defaultValue={verified ?? ""}
              aria-label="Trạng thái xác minh"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            >
              <option value="">Mọi trạng thái</option>
              <option value="true">Đã xác minh</option>
            </select>
            <select
              name="style"
              defaultValue={style ?? ""}
              aria-label="Phong cách giảng dạy"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            >
              <option value="">Mọi phong cách</option>
              <option value="STRUCTURED">Có cấu trúc</option>
              <option value="EXAM_FOCUSED">Luyện thi</option>
              <option value="FLEXIBLE">Linh hoạt</option>
              <option value="MOTIVATING">Truyền cảm hứng</option>
            </select>
            <select
              name="language"
              defaultValue={language ?? ""}
              aria-label="Ngôn ngữ giảng dạy"
              className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-2.5 py-1.5 text-xs text-[var(--ink)]"
            >
              <option value="">Mọi ngôn ngữ</option>
              <option value="VI">Tiếng Việt</option>
              <option value="EN">English</option>
              <option value="ZH">中文</option>
            </select>
            <button
              type="submit"
              className="rounded-lg bg-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--on-primary)] hover:bg-[var(--primary-hover)] transition-colors cursor-pointer"
            >
              Lọc
            </button>
            {(q || domain || verified || maxPrice || style || language) && (
              <Link
                href="/mentor"
                className="rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Xóa lọc
              </Link>
            )}
          </form>
        </div>

        {/* Mentor Cards Grid */}
        {filteredMentors.length > 0 ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMentors.map((m) => (
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
                          <p className="text-xs text-[var(--muted)]">
                            {m.school ?? "Cựu học sinh"}
                          </p>
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
                          <Badge key={mentorSkillLabel(exp)} tone="neutral" size="sm">
                            {mentorSkillLabel(exp)}
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
        ) : (
          <EmptyState
            title="Không tìm thấy mentor phù hợp"
            description="Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt các bộ lọc giới hạn."
            action={
              <LinkButton href="/mentor" variant="secondary" size="sm">
                Xem tất cả mentor
              </LinkButton>
            }
          />
        )}
      </section>
    </div>
  );
}
