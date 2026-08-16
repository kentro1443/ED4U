"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, LinkButton } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/DataDisplay";
import { Icons, type IconType } from "@/components/ui/icons";
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

const RADAR_AXES = [
  { key: "subjectExpertise", label: "Chuyên môn" },
  { key: "focusSkillStrength", label: "Kỹ năng" },
  { key: "availabilityFit", label: "Lịch rảnh" },
  { key: "budgetFit", label: "Ngân sách" },
  { key: "teachingStyleFit", label: "Phong cách" },
  { key: "experience", label: "Kinh nghiệm" },
] as const;

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
  const radarMetrics = RADAR_AXES.map((axis) => ({
    ...axis,
    value: selectedRec?.scoreBreakdown[axis.key] ?? null,
    weight: selectedRec?.appliedWeights[axis.key] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div
        data-testid="hybrid-intelligence-explainer"
        className="grid overflow-hidden rounded-[28px] bg-[var(--surface-dark)] text-white shadow-[var(--shadow-lg)] lg:grid-cols-[.8fr_1.2fr]"
      >
        <div className="p-6 sm:p-7">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/20 text-blue-200 ring-1 ring-inset ring-blue-300/20">
            <Icons.aiBrain className="h-6 w-6" />
          </div>
          <p className="mt-5 text-xs font-extrabold uppercase tracking-[0.14em] text-blue-300">
            Hybrid Neuro-Symbolic Intelligence
          </p>
          <h2 className="mt-3 text-balance text-2xl font-extrabold tracking-[-0.04em] text-white">
            Mỗi vị trí đều có dữ liệu và reasoning phía sau.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            AI diễn giải mục tiêu; logic biểu tượng loại vi phạm ràng buộc cứng; engine xác định thứ
            hạng và tạo bằng chứng có thể kiểm tra.
          </p>
        </div>
        <div className="grid gap-2 bg-white/[0.035] p-4 sm:grid-cols-3 sm:p-5 lg:items-stretch">
          {[
            ["01", "AI hiểu ý định", "Ngôn ngữ tự nhiên → tiêu chí có cấu trúc", "search"],
            ["02", "Symbolic validation", "Ràng buộc cứng → tập mentor hợp lệ", "cpu"],
            ["03", "Ranking + reasoning", "Điểm thành phần → lý do và đánh đổi", "network"],
          ].map(([number, title, detail, icon]) => {
            const Icon = Icons[icon as IconType];
            return (
              <div
                key={number}
                className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-inset ring-white/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-extrabold text-blue-300">{number}</span>
                  <Icon className="h-4 w-4 text-blue-200" />
                </div>
                <p className="mt-5 text-xs font-extrabold text-white">{title}</p>
                <p className="mt-2 text-[11px] leading-5 text-slate-400">{detail}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Disclaimer and Lens Switcher */}
      <div className="flex flex-col items-start justify-between gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-4 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
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
              className={`cursor-pointer rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors ${
                viewMode === item.key
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)] shadow-[var(--shadow-brand)]"
                  : "border-[var(--hairline)] bg-[var(--surface-card)] text-[var(--body)] hover:border-[var(--brand-100)] hover:bg-[var(--brand-50)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
        {/* Match Space radial visualisation */}
        <Card className="flex flex-col justify-between overflow-hidden rounded-[28px] p-4 sm:p-5">
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

          <div className="relative mt-3 flex items-center justify-center overflow-hidden rounded-[22px] border border-[var(--hairline-soft)] bg-[radial-gradient(circle_at_center,var(--brand-50),var(--surface-soft)_68%)]">
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
                      <line
                        x1={-nodeX}
                        y1={-nodeY}
                        x2="0"
                        y2="0"
                        stroke={isSelected ? "var(--brand-600)" : "var(--hairline)"}
                        strokeWidth={isSelected ? "1" : "0.6"}
                        strokeDasharray={isSelected ? undefined : "2 3"}
                        opacity={isSelected ? 0.55 : 0.65}
                      />
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

                      <text
                        y={n.eligible ? 12 : 10}
                        textAnchor="middle"
                        fontSize="4.6"
                        fontWeight={isSelected ? "700" : "600"}
                        fill={n.eligible ? "var(--body)" : "var(--muted)"}
                      >
                        {(n.displayName ?? "Mentor").split(" ").slice(-2).join(" ")}
                      </text>

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

        <div className="space-y-4">
          <MentorFitRadar
            mentorName={selectedDisplay?.fullName ?? null}
            matchScore={selectedNode?.matchScore ?? null}
            dataCoverage={selectedRec?.dataCoverage ?? null}
            metrics={radarMetrics}
            eligible={selectedNode?.eligible ?? false}
          />

          {/* Selected Mentor Detail Panel */}
          <aside
            className="space-y-4 rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)]"
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
                <div className="flex items-center justify-between rounded-2xl border border-[var(--brand-100)] bg-[var(--brand-50)] p-3">
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
                  <div className="rounded-xl border border-[var(--hairline)] p-2.5">
                    <span className="text-[11px] text-[var(--muted)] block">Học phí:</span>
                    <span className="font-bold text-sm text-[var(--ink)]">
                      {selectedDisplay.pricePerHour.toLocaleString("vi-VN")} đ
                    </span>
                  </div>
                  <div className="rounded-xl border border-[var(--hairline)] p-2.5">
                    <span className="text-[11px] text-[var(--muted)] block">
                      Độ bao phủ dữ liệu:
                    </span>
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
                      Reasoning · Vì sao phù hợp
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
                  <div className="space-y-1 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
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

function MentorFitRadar({
  mentorName,
  matchScore,
  dataCoverage,
  metrics,
  eligible,
}: {
  mentorName: string | null;
  matchScore: number | null;
  dataCoverage: number | null;
  metrics: Array<{ key: string; label: string; value: number | null; weight: number }>;
  eligible: boolean;
}) {
  const centerX = 120;
  const centerY = 108;
  const radius = 72;
  const pointAt = (index: number, scale = 1) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / metrics.length;
    return {
      x: centerX + Math.cos(angle) * radius * scale,
      y: centerY + Math.sin(angle) * radius * scale,
    };
  };
  const polygon = (scale: number) =>
    metrics
      .map((_, index) => {
        const point = pointAt(index, scale);
        return `${point.x},${point.y}`;
      })
      .join(" ");
  const scorePolygon = metrics
    .map((metric, index) => {
      const point = pointAt(index, Math.min(1, Math.max(0, metric.value ?? 0)));
      return `${point.x},${point.y}`;
    })
    .join(" ");

  return (
    <Card className="overflow-hidden rounded-[24px] p-0" data-testid="mentor-fit-radar">
      <div className="border-b border-[var(--hairline-soft)] bg-[var(--canvas)] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[var(--primary)]">
              Hồ sơ phù hợp 6 chiều
            </p>
            <h2 className="mt-2 text-base font-extrabold tracking-[-0.025em] text-[var(--ink)]">
              {mentorName ?? "Chọn một mentor"}
            </h2>
          </div>
          {eligible && matchScore !== null && (
            <Badge tone="brand" size="sm">
              Match {matchScore}
            </Badge>
          )}
        </div>

        {eligible && mentorName ? (
          <svg
            viewBox="0 0 240 224"
            className="mt-3 h-64 w-full overflow-visible"
            role="img"
            aria-label={`Biểu đồ radar sáu chiều phù hợp của ${mentorName}`}
          >
            {[0.25, 0.5, 0.75, 1].map((scale) => (
              <polygon
                key={scale}
                points={polygon(scale)}
                fill={scale === 1 ? "rgba(37,99,235,.025)" : "none"}
                stroke="var(--hairline)"
                strokeWidth="1"
              />
            ))}
            {metrics.map((metric, index) => {
              const outer = pointAt(index, 1);
              const label = pointAt(index, 1.25);
              const anchor =
                label.x < centerX - 8 ? "end" : label.x > centerX + 8 ? "start" : "middle";
              return (
                <g key={metric.key}>
                  <line
                    x1={centerX}
                    y1={centerY}
                    x2={outer.x}
                    y2={outer.y}
                    stroke="var(--hairline)"
                    strokeWidth="1"
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize="8.5"
                    fontWeight="700"
                    fill="var(--body)"
                  >
                    {metric.label}
                  </text>
                  <text
                    x={label.x}
                    y={label.y + 11}
                    textAnchor={anchor}
                    dominantBaseline="middle"
                    fontSize="7.5"
                    fontWeight="700"
                    fill={metric.value === null ? "var(--muted)" : "var(--primary)"}
                  >
                    {metric.value === null ? "N/A" : `${Math.round(metric.value * 100)}`}
                  </text>
                </g>
              );
            })}
            <polygon
              points={scorePolygon}
              fill="rgba(37,99,235,.22)"
              stroke="var(--brand-600)"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {metrics.map((metric, index) => {
              const point = pointAt(index, Math.min(1, Math.max(0, metric.value ?? 0)));
              return (
                <circle
                  key={metric.key}
                  cx={point.x}
                  cy={point.y}
                  r="3.5"
                  fill="white"
                  stroke="var(--brand-600)"
                  strokeWidth="2"
                />
              );
            })}
            <circle cx={centerX} cy={centerY} r="19" fill="var(--surface-dark)" />
            <text
              x={centerX}
              y={centerY - 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="12"
              fontWeight="800"
              fill="white"
            >
              {matchScore}
            </text>
            <text
              x={centerX}
              y={centerY + 10}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="5.5"
              fontWeight="700"
              fill="#93c5fd"
            >
              MATCH SCORE
            </text>
          </svg>
        ) : (
          <div className="mt-4 flex min-h-56 flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--hairline)] bg-[var(--surface-soft)]/60 p-6 text-center">
            <Icons.matchSpace className="h-8 w-8 text-[var(--muted)]" />
            <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
              Mentor bị lọc không có điểm thành phần. Chọn một hồ sơ đủ điều kiện để xem radar.
            </p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--hairline-soft)] sm:grid-cols-3 xl:grid-cols-2">
        {metrics.map((metric) => (
          <div key={metric.key} className="bg-white px-3 py-2.5">
            <p className="truncate text-[9px] font-bold text-[var(--muted)]">{metric.label}</p>
            <p className="mt-1 text-xs font-extrabold tabular-nums text-[var(--ink)]">
              {metric.value === null ? "N/A" : `${Math.round(metric.value * 100)} / 100`}
            </p>
          </div>
        ))}
      </div>
      <div className="border-t border-[var(--hairline-soft)] p-3 text-[10px] leading-4 text-[var(--muted)]">
        Độ phủ dữ liệu: {dataCoverage === null ? "—" : `${Math.round(dataCoverage * 100)}%`}. N/A
        nghĩa là engine không có điểm thực cho trục đó, không được hiểu là năng lực bằng 0.
      </div>
    </Card>
  );
}
