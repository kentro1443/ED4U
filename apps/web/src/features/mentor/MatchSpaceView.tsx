"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/DataDisplay";
import { Icons } from "@/components/ui/icons";
import { Drawer } from "@/components/ui/Overlays";
import { MentorBookingCard } from "./MentorBookingCard";
import { MATCH_SCORE_DISCLAIMER, layoutMatchSpace } from "@ed4u/domain/match-space";
import { filterReasonLabel } from "@/lib/mentor/presentation";
import type { MentorRunSnapshotV1, MentorDisplayNode } from "@/lib/mentor/schemas";

const FEATURE_LABEL_VI: Record<string, string> = {
  subjectExpertise: "Chuyên môn lĩnh vực",
  focusSkillStrength: "Kỹ năng trọng tâm",
  availabilityFit: "Khớp lịch rảnh",
  budgetFit: "Khớp ngân sách",
  teachingStyleFit: "Phong cách giảng dạy",
  rating: "Đánh giá học sinh",
  experience: "Kinh nghiệm giảng dạy",
};

type MatchViewMode = "Recommended" | "Eligible" | "Filtered";

function localizeEngineEvidence(
  text: string,
  mentorMap: ReadonlyMap<string, MentorDisplayNode>,
): string {
  let value = text;
  for (const [mentorId, mentor] of mentorMap) {
    value = value.replaceAll(mentorId, mentor.fullName);
  }

  value = value
    .replace(/^Teaches (.+)$/i, "Giảng dạy $1")
    .replace(/^Available at your requested time \((.+)\)$/i, "Rảnh đúng khung giờ bạn yêu cầu ($1)")
    .replace(
      /^Available at all (\d+) of your requested times$/i,
      "Rảnh ở đủ $1 khung giờ bạn yêu cầu",
    )
    .replace(
      /^Available at (\d+) of your (\d+) requested times \((.+)\)$/i,
      "Khớp $1/$2 khung giờ bạn yêu cầu ($3)",
    )
    .replace(/^(.+)\/hour is within your (.+) budget$/i, "Học phí $1/giờ nằm trong ngân sách $2")
    .replace(
      /^Identity and credentials verified by ED4U$/i,
      "Danh tính và chứng chỉ đã được ED4U xác minh",
    )
    .replace(
      /^Teaching style matches your preference: (.+)$/i,
      "Phong cách giảng dạy khớp mong muốn: $1",
    )
    .replace(
      /^Costs more per hour than (.+) \((.+) vs (.+)\)$/i,
      "Học phí cao hơn $1 ($2 so với $3)",
    )
    .replace(
      /^Fewer completed sessions than (.+) \((.+) vs (.+)\)$/i,
      "Ít buổi mentoring đã hoàn thành hơn $1 ($2 so với $3)",
    )
    .replace(
      /^Lower (IELTS|SAT|HSK) score than (.+) \((.+) vs (.+)\)$/i,
      "Điểm $1 thấp hơn $2 ($3 so với $4)",
    )
    .replace(
      /^Covers fewer of your requested times than (.+) \((.+) of (.+) vs (.+)\)$/i,
      "Khớp ít khung giờ hơn $1 ($2/$3 so với $4)",
    )
    .replace(/^Not yet verified by ED4U$/i, "Chưa được ED4U xác minh")
    .replace(/^No (IELTS|SAT|HSK) credential on record$/i, "Chưa có dữ liệu chứng chỉ $1")
    .replace(/^Holds no (IELTS|SAT|HSK) credential$/i, "Đã kiểm tra nhưng không có chứng chỉ $1")
    .replace(/^No rating on record yet$/i, "Chưa có dữ liệu đánh giá")
    .replace(/^No teaching history on record$/i, "Chưa có dữ liệu lịch sử giảng dạy")
    .replace(/^No teaching styles listed$/i, "Chưa công bố phong cách giảng dạy")
    .replace(/^No published (.+) score$/i, "Chưa công bố điểm $1");

  return value;
}

export function MatchSpaceView({
  runId,
  snapshot,
  timeZone,
}: {
  runId: string;
  snapshot: MentorRunSnapshotV1;
  timeZone: string;
}) {
  const [viewMode, setViewMode] = useState<MatchViewMode>("Recommended");
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(
    snapshot.result.recommendations[0]?.mentorId ?? null,
  );
  const [hoverMentorId, setHoverMentorId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isBookingOpen, setIsBookingOpen] = useState(false);

  // Map mentor metadata from display snapshot
  const mentorMap = useMemo(() => {
    return new Map<string, MentorDisplayNode>(
      snapshot.mentorDisplaySnapshot.map((m) => [m.mentorId, m]),
    );
  }, [snapshot.mentorDisplaySnapshot]);

  // Map rejection reasons
  const rejectionMap = useMemo(() => {
    return new Map<string, string[]>(
      snapshot.hardConstraintSnapshot.rejected.map((r) => [r.mentorId, r.reasons]),
    );
  }, [snapshot.hardConstraintSnapshot.rejected]);

  // Recommendations map
  const recMap = useMemo(() => {
    return new Map(snapshot.result.recommendations.map((r) => [r.mentorId, r]));
  }, [snapshot.result.recommendations]);

  // Build nodes for Match Space layout
  const allNodes = useMemo(() => {
    const recs = snapshot.result.recommendations.map((r) => {
      const display = mentorMap.get(r.mentorId);
      return {
        mentorId: r.mentorId,
        displayName: display?.fullName ?? r.mentorId,
        matchScore: r.matchScore,
        eligible: true,
        rejectionReasons: [] as string[],
        clusterKey: display?.clusterKey ?? "GENERAL",
      };
    });

    const recIds = new Set(recs.map((r) => r.mentorId));
    const nonRecs = snapshot.mentorDisplaySnapshot
      .filter((m) => !recIds.has(m.mentorId))
      .map((m) => {
        const isEligible = snapshot.hardConstraintSnapshot.eligible.includes(m.mentorId);
        return {
          mentorId: m.mentorId,
          displayName: m.fullName,
          matchScore: 0,
          eligible: isEligible,
          rejectionReasons: isEligible
            ? ["Nằm ngoài Top-K"]
            : (rejectionMap.get(m.mentorId) ?? ["Không đạt ràng buộc cứng"]),
          clusterKey: m.clusterKey,
        };
      });

    return [...recs, ...nonRecs];
  }, [snapshot, mentorMap, rejectionMap]);

  // Display-only lenses never mutate or re-rank the persisted historical run.
  const visibleNodes = useMemo(() => {
    const recommendedIds = new Set(snapshot.result.recommendations.map((r) => r.mentorId));
    if (viewMode === "Recommended")
      return allNodes.filter((node) => recommendedIds.has(node.mentorId));
    if (viewMode === "Eligible") return allNodes.filter((node) => node.eligible);
    return allNodes.filter((node) => !node.eligible);
  }, [allNodes, snapshot.result.recommendations, viewMode]);

  const layout = useMemo(
    () =>
      layoutMatchSpace({
        requestId: runId,
        engineVersion: snapshot.engineVersion,
        mentors: visibleNodes,
        lens: "All",
      }),
    [runId, snapshot.engineVersion, visibleNodes],
  );

  useEffect(() => {
    if (!layout.nodes.some((node) => node.mentorId === selectedMentorId)) {
      setSelectedMentorId(layout.nodes[0]?.mentorId ?? null);
    }
  }, [layout.nodes, selectedMentorId]);

  // Selected mentor details
  const selectedNode = layout.nodes.find((n) => n.mentorId === selectedMentorId);
  const selectedDisplay = selectedMentorId ? mentorMap.get(selectedMentorId) : null;
  const selectedRec = selectedMentorId ? recMap.get(selectedMentorId) : null;

  return (
    <div className="space-y-6">
      {/* Disclaimer and Lens Switcher */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[var(--surface-soft)] border border-[var(--hairline)] rounded-xl p-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] block">
            Điểm Match Score là điểm xếp hạng, không phải xác suất thành công.
          </span>
          <span className="text-xs text-[var(--body)] mt-0.5 block">
            Khoảng cách đến tâm = hàm đơn điệu của (1 − Match Score). Gần hơn = phù hợp hơn.
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" data-testid="constraint-lens">
          {(
            [
              { key: "Recommended", label: `Đề xuất (${snapshot.result.recommendations.length})` },
              {
                key: "Eligible",
                label: `Đủ điều kiện (${snapshot.hardConstraintSnapshot.eligible.length})`,
              },
              {
                key: "Filtered",
                label: `Bị lọc (${snapshot.hardConstraintSnapshot.rejected.length})`,
              },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setViewMode(item.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors cursor-pointer ${
                viewMode === item.key
                  ? "bg-[var(--primary)] text-[var(--on-primary)] border-[var(--primary)] shadow-xs"
                  : "bg-[var(--canvas)] text-[var(--body)] border-[var(--hairline)] hover:border-[var(--muted)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Radar Visualisation */}
        <Card className="p-4 flex flex-col justify-between overflow-hidden">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--hairline-soft)] text-xs text-[var(--muted)]">
            <span className="font-semibold text-[var(--ink)]">
              Không gian phù hợp (Match Space 2.0)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
                className="rounded border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1 hover:bg-[var(--surface-soft)] cursor-pointer font-bold"
                title="Phóng to"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                className="rounded border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1 hover:bg-[var(--surface-soft)] cursor-pointer font-bold"
                title="Thu nhỏ"
              >
                −
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                className="rounded border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1 hover:bg-[var(--surface-soft)] cursor-pointer"
              >
                Đặt lại
              </button>
            </div>
          </div>

          <div className="relative mt-2 flex items-center justify-center bg-[var(--surface-soft)] rounded-xl border border-[var(--hairline-soft)] overflow-hidden">
            <svg
              viewBox="-130 -130 260 260"
              className="h-[460px] w-full select-none"
              role="img"
              aria-label="Mentor Match Space Radar"
            >
              <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                {/* Concentric Score Rings: Integer values, not percentages */}
                {[
                  { score: 100, radius: 20, label: "100" },
                  { score: 80, radius: 45, label: "80" },
                  { score: 60, radius: 70, label: "60" },
                  { score: 40, radius: 95, label: "40" },
                ].map((ring) => (
                  <g key={ring.score}>
                    <circle
                      r={ring.radius}
                      fill="none"
                      stroke="var(--hairline)"
                      strokeWidth="1"
                      strokeDasharray={ring.score < 100 ? "3 3" : undefined}
                    />
                    <text
                      x="4"
                      y={-ring.radius + 10}
                      fontSize="5"
                      fill="var(--muted)"
                      fontFamily="sans-serif"
                    >
                      {ring.label}
                    </text>
                  </g>
                ))}

                {/* Center Student Node */}
                <circle r="7" fill="var(--primary)" />
                <text y="16" textAnchor="middle" fontSize="6.5" fontWeight="bold" fill="var(--ink)">
                  Bạn (Mục tiêu)
                </text>

                {/* Mentor Nodes */}
                {layout.nodes.map((n) => {
                  const isSelected = n.mentorId === selectedMentorId;
                  const isHovered = n.mentorId === hoverMentorId;
                  const nodeX = n.x * 90;
                  const nodeY = n.y * 90;

                  return (
                    <g
                      key={n.mentorId}
                      transform={`translate(${nodeX} ${nodeY})`}
                      onMouseEnter={() => setHoverMentorId(n.mentorId)}
                      onMouseLeave={() => setHoverMentorId(null)}
                      onClick={() => setSelectedMentorId(n.mentorId)}
                      className="cursor-pointer"
                    >
                      {isSelected && (
                        <circle
                          r="10"
                          fill="none"
                          stroke="var(--brand-accent)"
                          strokeWidth="2"
                          opacity="0.8"
                        />
                      )}
                      <circle
                        r={n.eligible ? (isSelected ? 7 : 5.5) : 4}
                        fill={
                          n.eligible
                            ? isSelected
                              ? "var(--brand-accent)"
                              : "var(--primary)"
                            : "#9ca3af"
                        }
                        opacity={n.eligible ? 1 : 0.45}
                        stroke="var(--canvas)"
                        strokeWidth="1.5"
                      />

                      {(isHovered || isSelected) && (
                        <g>
                          <rect
                            x="-24"
                            y="-20"
                            width="48"
                            height="12"
                            rx="3"
                            fill="var(--surface-dark)"
                            opacity="0.9"
                          />
                          <text
                            y="-12"
                            textAnchor="middle"
                            fontSize="5.5"
                            fontWeight="600"
                            fill="#ffffff"
                          >
                            {n.eligible ? `Score ${n.matchScore}` : "Bị lọc"}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-[var(--muted)] pt-2 border-t border-[var(--hairline-soft)]">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 rounded-full bg-[var(--primary)] inline-block" />
                Đủ điều kiện & Xếp hạng
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-gray-400 opacity-50 inline-block" />
                Bị loại (Ràng buộc cứng)
              </span>
            </div>
            <span>{layout.nodes.length} hồ sơ hiển thị</span>
          </div>
        </Card>

        {/* Selected Mentor Detail Panel */}
        <aside
          className="space-y-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5 shadow-xs"
          data-testid="mentor-detail"
        >
          {selectedNode && selectedDisplay ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar name={selectedDisplay.fullName} size="md" />
                  <div>
                    <h2 className="font-bold text-base text-[var(--ink)] leading-snug">
                      {selectedDisplay.fullName}
                    </h2>
                    <p className="text-xs text-[var(--muted)]">
                      {selectedDisplay.school ?? "Cựu học sinh"}
                    </p>
                  </div>
                </div>
                {selectedDisplay.verified && (
                  <Badge tone="success" size="sm">
                    Đã xác minh
                  </Badge>
                )}
              </div>

              {/* Match Score & Rank */}
              <div className="rounded-lg bg-[var(--surface-soft)] p-3 border border-[var(--hairline)] flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-[var(--muted)] uppercase block">
                    Điểm phù hợp (Match Score)
                  </span>
                  <span className="text-2xl font-black text-[var(--ink)]">
                    {selectedNode.matchScore}
                    <span className="text-xs font-normal text-[var(--muted)]"> / 100</span>
                  </span>
                </div>
                {selectedRec && (
                  <Badge tone="brand" size="md">
                    Hạng #{selectedRec.rank}
                  </Badge>
                )}
              </div>

              {/* Hourly Price & Availability */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-[var(--hairline)] p-2.5">
                  <span className="text-[11px] text-[var(--muted)] block">Học phí:</span>
                  <span className="font-bold text-sm text-[var(--ink)]">
                    {selectedDisplay.pricePerHour.toLocaleString("vi-VN")} đ
                  </span>
                </div>
                <div className="rounded-md border border-[var(--hairline)] p-2.5">
                  <span className="text-[11px] text-[var(--muted)] block">Độ bao phủ dữ liệu:</span>
                  <span className="font-bold text-sm text-[var(--ink)]">
                    {selectedRec ? `${(selectedRec.dataCoverage * 100).toFixed(0)}%` : "—"}
                  </span>
                </div>
              </div>

              {/* Factual Reasons from Engine */}
              {selectedRec && selectedRec.reasons.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--ink)] flex items-center gap-1.5">
                    <Icons.check className="h-3.5 w-3.5 text-emerald-600" />
                    Lý do phù hợp chính
                  </h3>
                  <ul className="space-y-1.5 text-xs text-[var(--body)] leading-relaxed pl-1">
                    {selectedRec.reasons.map((r, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold">•</span>
                        <span>{localizeEngineEvidence(r, mentorMap)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Factual Tradeoffs from Engine */}
              {selectedRec && selectedRec.tradeoffs.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
                    <Icons.alertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    Điểm cần cân nhắc
                  </h3>
                  <ul className="space-y-1 text-xs text-[var(--muted)] leading-relaxed pl-1">
                    {selectedRec.tradeoffs.map((t, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-amber-600 font-bold">•</span>
                        <span>{localizeEngineEvidence(t, mentorMap)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Rejection reasons if filtered out */}
              {!selectedNode.eligible && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800 space-y-1">
                  <span className="font-bold block">Lý do bị loại khỏi gợi ý:</span>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {selectedNode.rejectionReasons.map((r, i) => (
                      <li key={i}>{filterReasonLabel(r)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Feature Score Breakdown */}
              {selectedRec && (
                <div className="space-y-2 pt-2 border-t border-[var(--hairline-soft)]">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--muted)] block">
                    Chi tiết thành phần điểm số
                  </span>
                  <div className="space-y-2">
                    {Object.entries(selectedRec.scoreBreakdown).map(([feature, score]) => {
                      const weight = selectedRec.appliedWeights[feature] ?? 0;
                      const label = FEATURE_LABEL_VI[feature] ?? feature;
                      return (
                        <div key={feature} className="space-y-0.5 text-xs">
                          <div className="flex justify-between text-[11px]">
                            <span className="text-[var(--body)]">{label}</span>
                            <span className="font-semibold text-[var(--ink)]">
                              {(score * 100).toFixed(0)} / 100{" "}
                              <span className="text-[var(--muted)] font-normal">
                                (trọng số {(weight * 100).toFixed(0)}%)
                              </span>
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-[var(--surface-soft)] rounded-full overflow-hidden border border-[var(--hairline-soft)]">
                            <div
                              className="h-full bg-[var(--primary)] rounded-full transition-all"
                              style={{ width: `${Math.max(4, score * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CTA Buttons */}
              <div className="pt-3 border-t border-[var(--hairline)] flex flex-col gap-2">
                {selectedNode.eligible && (
                  <Button
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={() => setIsBookingOpen(true)}
                    className="w-full shadow-sm"
                  >
                    <Icons.appointments className="h-4 w-4 mr-1.5" />
                    Đặt lịch học với {selectedDisplay.fullName}
                  </Button>
                )}
                <LinkButton
                  href={`/mentor/${selectedDisplay.mentorId}`}
                  variant="secondary"
                  size="md"
                  className="w-full text-center"
                >
                  Xem hồ sơ chi tiết
                </LinkButton>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[var(--muted)] space-y-2">
              <Icons.mentor className="h-8 w-8 mx-auto text-[var(--muted)] opacity-50" />
              <p>Chọn một mentor trên bản đồ hoặc bảng bên dưới để xem chi tiết lý do gợi ý.</p>
            </div>
          )}
        </aside>
      </div>

      {/* Comparison Table */}
      <Card className="p-5 overflow-x-auto" data-testid="match-table">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-sm font-bold text-[var(--ink)] uppercase tracking-wider">
            Bảng đối chiếu thứ hạng & Bằng chứng thực tế
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[var(--hairline)] text-[var(--muted)] uppercase font-semibold text-[11px]">
                <th className="py-2.5 px-3">Hạng</th>
                <th className="py-2.5 px-3">Mentor</th>
                <th className="py-2.5 px-3">Match Score</th>
                <th className="py-2.5 px-3">Điều kiện</th>
                <th className="py-2.5 px-3">Học phí</th>
                <th className="py-2.5 px-3">Lý do chính / Ràng buộc</th>
                <th className="py-2.5 px-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-soft)]">
              {layout.nodes.map((n, idx) => {
                const isSelected = n.mentorId === selectedMentorId;
                const mDisplay = mentorMap.get(n.mentorId);
                const rec = recMap.get(n.mentorId);

                return (
                  <tr
                    key={n.mentorId}
                    onClick={() => setSelectedMentorId(n.mentorId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[var(--surface-soft)] font-medium"
                        : "hover:bg-[var(--surface-soft)]/50"
                    }`}
                  >
                    <td className="py-3 px-3">
                      {rec ? (
                        <span className="font-bold text-[var(--ink)]">#{rec.rank}</span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        <Avatar name={n.displayName ?? "Mentor"} size="sm" />
                        <div>
                          <span className="font-semibold text-[var(--ink)] block">
                            {n.displayName ?? "Mentor"}
                          </span>
                          <span className="text-[11px] text-[var(--muted)]">
                            {mDisplay?.headline ?? "Mentor"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      {n.eligible ? (
                        <span className="font-bold text-[var(--ink)] text-sm">{n.matchScore}</span>
                      ) : (
                        <span className="text-[var(--muted)]">0</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {n.eligible ? (
                        <Badge tone="success" size="sm">
                          Đạt chuẩn
                        </Badge>
                      ) : (
                        <Badge tone="neutral" size="sm">
                          Bị loại
                        </Badge>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {mDisplay ? `${mDisplay.pricePerHour.toLocaleString("vi-VN")} đ` : "—"}
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-[var(--muted)]">
                      {rec && rec.reasons.length > 0
                        ? localizeEngineEvidence(rec.reasons[0], mentorMap)
                        : n.rejectionReasons.map(filterReasonLabel).join("; ") || "—"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      {n.eligible ? (
                        <Button
                          type="button"
                          variant={isSelected ? "primary" : "secondary"}
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedMentorId(n.mentorId);
                            setIsBookingOpen(true);
                          }}
                        >
                          Đặt lịch
                        </Button>
                      ) : (
                        <span className="text-[11px] text-[var(--muted)]">Không khả dụng</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Booking Drawer for Selected Mentor */}
      {selectedDisplay && (
        <Drawer
          open={isBookingOpen}
          onOpenChange={setIsBookingOpen}
          side="right"
          title={`Đặt lịch hẹn: ${selectedDisplay.fullName}`}
          description="Chọn khung giờ học và xác nhận giao dịch qua luồng kiểm tra trực tiếp."
        >
          <div className="pt-4 pb-6">
            <MentorBookingCard
              mentorId={selectedDisplay.mentorId}
              mentorName={selectedDisplay.fullName}
              pricePerHour={selectedDisplay.pricePerHour}
              availability={selectedDisplay.availability ?? []}
              recommendationRunId={runId}
              verified={selectedDisplay.verified}
              timeZone={timeZone}
            />
          </div>
        </Drawer>
      )}
    </div>
  );
}
