import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { EmptyState, ForbiddenState, Alert } from "@/components/ui/Feedback";
import { MatchSpaceView } from "@/features/mentor/MatchSpaceView";
import { requireActor } from "@/lib/authz";
import { parseMentorMatchPayload, parseMentorRunSnapshot } from "@/lib/mentor/schemas";
import { Icons } from "@/components/ui/icons";

export default async function MatchSpacePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const actor = await requireActor();
  const { run: runId } = await searchParams;

  let runRecord = null;
  let isLatestFallback = false;

  if (runId) {
    runRecord = await db.mentorRecommendationRun.findUnique({
      where: { id: runId },
      include: { request: true },
    });

    if (
      runRecord &&
      (runRecord.request.tenantId !== actor.tenantId ||
        runRecord.request.studentId !== actor.userId)
    ) {
      return (
        <div className="space-y-6">
          <PageHeader title="Mentor Match Space" />
          <ForbiddenState
            title="Không thể truy cập kết quả gợi ý"
            description="Lượt gợi ý này thuộc về tài khoản khác hoặc không thuộc trường của bạn."
          />
        </div>
      );
    }
  } else {
    // Invariant 6: If no run param, load the latest owned run or show an empty state
    runRecord = await db.mentorRecommendationRun.findFirst({
      where: {
        request: {
          studentId: actor.userId,
          tenantId: actor.tenantId,
        },
      },
      include: { request: true },
      orderBy: { createdAt: "desc" },
    });
    if (runRecord) {
      isLatestFallback = true;
    }
  }

  if (!runRecord) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Mentor Match Space"
          description="Khám phá không gian xếp hạng mentor từ Mentor Intelligence Engine."
        />
        <EmptyState
          title="Chưa có kết quả gợi ý nào"
          description="Bạn chưa thực hiện lượt tìm kiếm mentor nào. Hãy nhập nhu cầu học tập để Mentor Engine phân tích và xếp hạng."
          action={
            <LinkButton href="/mentor" variant="primary" size="md">
              <Icons.search className="h-4 w-4 mr-1.5" />
              Tìm mentor ngay
            </LinkButton>
          }
        />
      </div>
    );
  }

  // Parse immutable versioned JSON snapshots with Zod
  const snapshot = parseMentorRunSnapshot(runRecord.result);
  const payload = parseMentorMatchPayload(runRecord.request.payload);

  if (!snapshot || !payload) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mentor Match Space" />
        <Alert tone="danger" title="Dữ liệu kết quả không hợp lệ">
          Không thể giải mã bản ghi kết quả gợi ý theo hợp đồng dữ liệu version 1.
        </Alert>
      </div>
    );
  }

  const reqSummary = payload.parsedSummary;
  const tenant = await db.tenant.findUnique({
    where: { id: actor.tenantId },
    select: { timezone: true },
  });
  const timeZone = tenant?.timezone ?? "Asia/Ho_Chi_Minh";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mentor Match Space"
        description="Biểu đồ trực quan hóa kết quả xếp hạng và khoảng cách phù hợp từ Mentor Intelligence Engine."
        actions={
          <LinkButton href="/mentor" variant="secondary" size="md">
            <Icons.search className="h-4 w-4 mr-1.5" />
            Tạo yêu cầu mới
          </LinkButton>
        }
      />

      {isLatestFallback && (
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3 text-xs text-[var(--muted)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icons.matchSpace className="h-4 w-4 text-[var(--primary)]" />
            <span>Hiển thị kết quả từ lần tìm kiếm gần nhất của bạn.</span>
          </div>
          <Link href="/mentor" className="text-[var(--primary)] font-semibold hover:underline">
            Tạo lượt tìm kiếm mới →
          </Link>
        </div>
      )}

      {/* Request Summary Card */}
      {reqSummary && (
        <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-4 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[var(--ink)]">Yêu cầu đã phân tích:</span>
            <Badge tone="brand" size="sm">
              {reqSummary.domain}
            </Badge>
            {reqSummary.focusSkills.map((sk) => (
              <Badge key={sk} tone="neutral" size="sm">
                {sk.replace(`${reqSummary.domain}.`, "")}
              </Badge>
            ))}
            {reqSummary.maxPricePerHour && (
              <Badge tone="neutral" size="sm">
                Tối đa {reqSummary.maxPricePerHour.toLocaleString("vi-VN")} đ/h
              </Badge>
            )}
            {reqSummary.verifiedOnly && (
              <Badge tone="success" size="sm">
                Chỉ mentor xác minh
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-[var(--muted)]">
            Thời gian: {new Date(payload.createdAt).toLocaleString("vi-VN", { timeZone })}
          </span>
        </div>
      )}

      {/* Main Match Space View */}
      <MatchSpaceView runId={runRecord.id} snapshot={snapshot} timeZone={timeZone} />
    </div>
  );
}
