"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { FacilityPlan, PlanResult } from "@ed4u/facility-engine";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Icons } from "@/components/ui/icons";
import type { FacilityRoomMapItem, FacilityRoomMapStatus } from "@/lib/facility/room-map";
import {
  createRoomRequestFromPlanAction,
  parseFacilityPromptAction,
  planFacilityAction,
  type FacilityPlanInput,
} from "./actions";

interface PlannerProps {
  roomTypes: { code: string; name: string }[];
  features: { code: string; name: string }[];
  canRequest: boolean;
  initialPrompt?: string;
  clubEventId?: string | null;
}

const EXAMPLES = [
  "80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên hội trường",
  "35 người, sáng thứ Ba, cần máy tính, ưu tiên phòng máy",
  "20 người, thứ Năm từ 18:00-20:00, cần máy chiếu",
] as const;

const ROOM_STATUS_META: Record<
  FacilityRoomMapStatus,
  { label: string; dot: string; surface: string }
> = {
  AVAILABLE: {
    label: "Trống",
    dot: "bg-emerald-500",
    surface: "border-emerald-200 bg-emerald-50/70",
  },
  OCCUPIED: {
    label: "Đã có lịch",
    dot: "bg-slate-500",
    surface: "border-slate-200 bg-slate-50",
  },
  SOFT_HOLD: {
    label: "Soft hold",
    dot: "bg-amber-500",
    surface: "border-amber-200 bg-amber-50/70",
  },
  MAINTENANCE: {
    label: "Bảo trì",
    dot: "bg-rose-500",
    surface: "border-rose-200 bg-rose-50/70",
  },
  UNAVAILABLE: {
    label: "Ngừng hoạt động",
    dot: "bg-slate-300",
    surface: "border-slate-200 bg-slate-100/80",
  },
};

function FacilityRoomMap({
  rooms,
  selectedRoomId,
  onSelect,
}: {
  rooms: FacilityRoomMapItem[];
  selectedRoomId: string | null;
  onSelect: (roomId: string) => void;
}) {
  const groups = rooms.reduce<Map<string, FacilityRoomMapItem[]>>((current, room) => {
    const key = `${room.building} · Tầng ${room.floor}`;
    current.set(key, [...(current.get(key) ?? []), room]);
    return current;
  }, new Map());

  return (
    <Card className="overflow-hidden" data-testid="facility-room-map">
      <CardHeader className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)]">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
            <Icons.map className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Bản đồ trạng thái phòng</CardTitle>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Trạng thái vật lý theo đúng ngày và khung giờ đã xác nhận.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4 lg:max-h-[660px] lg:overflow-y-auto">
        <div className="flex flex-wrap gap-x-3 gap-y-2" aria-label="Chú giải trạng thái phòng">
          {Object.entries(ROOM_STATUS_META).map(([status, meta]) => (
            <span
              key={status}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--muted)]"
            >
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          ))}
        </div>
        {[...groups.entries()].map(([group, groupRooms]) => (
          <div key={group}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
              {group}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {groupRooms.map((room) => {
                const status = ROOM_STATUS_META[room.status];
                const isRecommended = room.eligibility === "RECOMMENDED";
                const isSelected = selectedRoomId === room.id;
                return (
                  <button
                    key={room.id}
                    type="button"
                    disabled={!isRecommended}
                    onClick={() => onSelect(room.id)}
                    aria-pressed={isSelected}
                    aria-label={`${room.code}: ${room.statusLabel}${room.rejectionLabel ? `, ${room.rejectionLabel}` : ""}`}
                    className={`relative min-h-24 rounded-xl border p-3 text-left transition-[border-color,box-shadow,transform] ${status.surface} ${isRecommended ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-[var(--shadow-sm)]" : "cursor-default"} ${isSelected ? "border-[var(--brand-600)] ring-2 ring-blue-500/15" : ""}`}
                  >
                    {room.recommendationRank && (
                      <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-md bg-[var(--primary)] px-1 text-[9px] font-extrabold text-white">
                        #{room.recommendationRank}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 pr-6 text-xs font-extrabold text-[var(--ink)]">
                      <Icons.roomDoor className="h-3.5 w-3.5" aria-hidden="true" />
                      {room.code}
                    </span>
                    <span className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-[var(--body)]">
                      <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                      {room.statusLabel}
                    </span>
                    <span className="mt-1 block text-[9px] leading-4 text-[var(--muted)]">
                      {room.rejectionLabel ?? `${room.capacity} chỗ · ${room.roomType}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

const RADAR_AXES = [
  { key: "roomTypeFit", label: "Loại phòng", weight: "28%" },
  { key: "buildingFit", label: "Vị trí", weight: "18%" },
  { key: "capacityEfficiency", label: "Sức chứa", weight: "32%" },
  { key: "holdSafety", label: "Độ chắc chắn", weight: "14%" },
  { key: "timeFit", label: "Khung giờ", weight: "8%" },
  { key: "hardFeatures", label: "Tiện ích", weight: "Cứng" },
] as const;

function radarPoint(index: number, value: number, radius: number, center = 120) {
  const angle = -Math.PI / 2 + (index * Math.PI * 2) / RADAR_AXES.length;
  return `${center + Math.cos(angle) * radius * value},${center + Math.sin(angle) * radius * value}`;
}

function FacilityFitRadar({ plan }: { plan: FacilityPlan }) {
  const values = {
    roomTypeFit: plan.soft.roomTypeFit,
    buildingFit: plan.soft.buildingFit,
    capacityEfficiency: plan.soft.capacityEfficiency,
    holdSafety: 1 - plan.soft.holdRisk,
    timeFit: plan.soft.timeFit,
    hardFeatures: 1,
  };
  const polygon = RADAR_AXES.map((axis, index) => radarPoint(index, values[axis.key], 76)).join(
    " ",
  );

  return (
    <Card
      className="overflow-hidden border-[var(--brand-100)] shadow-[var(--shadow-md)]"
      data-testid="facility-fit-radar"
    >
      <CardHeader className="border-b border-[var(--brand-100)] bg-[linear-gradient(135deg,var(--brand-50),white_72%)] text-center">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[var(--primary)]">
          Phương án đang phân tích
        </p>
        <CardTitle className="mt-1 text-2xl">{plan.roomCode}</CardTitle>
        <p className="mt-1 text-xs text-[var(--muted)]">
          <strong className="text-[var(--ink)]">{plan.score.toFixed(1)}/100</strong> điểm xếp hạng
        </p>
      </CardHeader>
      <CardContent className="pt-3">
        <div className="relative mx-auto aspect-square w-full max-w-[300px]">
          <svg
            viewBox="0 0 240 240"
            role="img"
            aria-labelledby="facility-radar-title facility-radar-desc"
            className="h-full w-full overflow-visible"
          >
            <title id="facility-radar-title">Radar mức độ phù hợp của phòng {plan.roomCode}</title>
            <desc id="facility-radar-desc">
              Sáu trục gồm loại phòng, vị trí, sức chứa, độ chắc chắn, khung giờ và tiện ích bắt
              buộc.
            </desc>
            {[0.25, 0.5, 0.75, 1].map((level) => (
              <polygon
                key={level}
                points={RADAR_AXES.map((_, index) => radarPoint(index, level, 76)).join(" ")}
                fill="none"
                stroke={level === 1 ? "#bfdbfe" : "#e5e7eb"}
                strokeWidth={level === 1 ? 1.5 : 1}
              />
            ))}
            {RADAR_AXES.map((_, index) => (
              <line
                key={index}
                x1="120"
                y1="120"
                x2={radarPoint(index, 1, 76).split(",")[0]}
                y2={radarPoint(index, 1, 76).split(",")[1]}
                stroke="#e5e7eb"
              />
            ))}
            <polygon
              points={polygon}
              fill="rgba(37,99,235,.2)"
              stroke="#2563eb"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {RADAR_AXES.map((axis, index) => {
              const [x, y] = radarPoint(index, 1.23, 76).split(",").map(Number);
              const anchor = x < 105 ? "end" : x > 135 ? "start" : "middle";
              return (
                <g key={axis.key}>
                  <circle
                    cx={radarPoint(index, values[axis.key], 76).split(",")[0]}
                    cy={radarPoint(index, values[axis.key], 76).split(",")[1]}
                    r="3.5"
                    fill="#1749c8"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <text
                    x={x}
                    y={y}
                    textAnchor={anchor}
                    className="fill-[var(--body)] text-[8px] font-bold"
                  >
                    {axis.label}
                  </text>
                  <text
                    x={x}
                    y={y + 10}
                    textAnchor={anchor}
                    className="fill-[var(--muted)] text-[7px] font-semibold"
                  >
                    {Math.round(values[axis.key] * 100)} · {axis.weight}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        <div className="rounded-xl border border-[var(--brand-100)] bg-[var(--brand-50)] p-3 text-[10px] leading-5 text-[var(--body)]">
          <strong className="text-[var(--primary)]">Hybrid Neuro-Symbolic:</strong> radar hiển thị 5
          tiêu chí xếp hạng thực. Trục “Tiện ích” là ràng buộc cứng đã đạt, trọng số 0% và không thể
          bù bằng điểm mềm.
        </div>
      </CardContent>
    </Card>
  );
}

function FacilityReasoning({ plan }: { plan: FacilityPlan }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)]">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-50)] text-[var(--primary)] ring-1 ring-inset ring-[var(--brand-100)]">
            <Icons.aiBrain className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <CardTitle>Reasoning minh bạch</CardTitle>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              Giải thích từ feature breakdown thật của engine.
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Vì sao phù hợp
          </p>
          <div className="mt-2 space-y-2">
            {plan.reasons.map((reason) => (
              <p key={reason} className="flex gap-2 text-xs leading-5 text-[var(--body)]">
                <Icons.check
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                {reason}
              </p>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
            Điểm cần cân nhắc
          </p>
          <div className="mt-2 space-y-2">
            {plan.tradeoffs.length > 0 ? (
              plan.tradeoffs.map((tradeoff) => (
                <p key={tradeoff} className="flex gap-2 text-xs leading-5 text-[var(--body)]">
                  <Icons.alertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  {tradeoff}
                </p>
              ))
            ) : (
              <p className="flex gap-2 text-xs leading-5 text-[var(--body)]">
                <Icons.available
                  className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                Không phát hiện đánh đổi đáng kể trong trạng thái hiện tại.
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-[var(--hairline-soft)] pt-4 text-[10px]">
          <span className="text-[var(--muted)]">Rủi ro soft hold</span>
          <strong className="text-right text-[var(--ink)]">
            {Math.round(plan.pendingConflictRisk * 100)}%
          </strong>
          <span className="text-[var(--muted)]">Ràng buộc cứng</span>
          <strong className="text-right text-emerald-700">Đã đạt toàn bộ</strong>
        </div>
      </CardContent>
    </Card>
  );
}

export function FacilityPlanner({
  roomTypes,
  features,
  canRequest,
  initialPrompt = "",
  clubEventId = null,
}: PlannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rawText, setRawText] = useState(initialPrompt);
  const [date, setDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preferredRoomType, setPreferredRoomType] = useState("");
  const [requiredFeatures, setRequiredFeatures] = useState<string[]>([]);
  const [flexible, setFlexible] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
  const [roomMap, setRoomMap] = useState<FacilityRoomMapItem[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [stateSummary, setStateSummary] = useState<{
    rooms: number;
    hardOccupancy: number;
    activeSoftHolds: number;
    timeZone: string;
  } | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const criteria = (): FacilityPlanInput | null => {
    const count = Number(attendees);
    if (!rawText.trim() || !date || !Number.isInteger(count) || count <= 0 || !start || !end) {
      setMessage({
        type: "error",
        text: "Hãy xác nhận ngày, số người và khung giờ trước khi chạy Facility Engine.",
      });
      return null;
    }
    return {
      rawText: rawText.trim(),
      date,
      attendees: count,
      start,
      end,
      requiredFeatures,
      preferredRoomType: preferredRoomType || null,
      preferredBuilding: null,
      flexible,
    };
  };

  const parsePrompt = () => {
    if (rawText.trim().length < 3) {
      setMessage({ type: "error", text: "Hãy mô tả nhu cầu phòng trước." });
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const response = await parseFacilityPromptAction(rawText);
      if (!response.ok) {
        setMessage({ type: "error", text: response.error });
        return;
      }
      const parsed = response.data;
      setAttendees(parsed.attendees ? String(parsed.attendees) : "");
      setDate(parsed.suggestedDate ?? "");
      setStart(parsed.start ?? "");
      setEnd(parsed.end ?? "");
      setRequiredFeatures(parsed.requiredFeatures);
      setPreferredRoomType(parsed.preferredRoomType ?? "");
      setFlexible(parsed.flexible);
      setNotes(parsed.notes);
      setResult(null);
    });
  };

  const runPlanner = () => {
    const input = criteria();
    if (!input) return;
    setMessage(null);
    startTransition(async () => {
      const response = await planFacilityAction(input);
      if (!response.ok) {
        setResult(null);
        setMessage({ type: "error", text: response.error });
        return;
      }
      setResult(response.result);
      setRoomMap(response.roomMap);
      setSelectedPlanId(response.result.kind === "PLANS" ? response.result.plans[0]?.roomId : null);
      setStateSummary(response.stateSummary);
    });
  };

  const requestPlan = (roomId: string) => {
    const input = criteria();
    if (!input) return;
    startTransition(async () => {
      const response = await createRoomRequestFromPlanAction({
        criteria: input,
        roomId,
        clubEventId,
      });
      if (!response.ok) {
        setMessage({ type: "error", text: response.error });
        return;
      }
      setMessage({
        type: "success",
        text: response.duplicate
          ? "Yêu cầu này đã tồn tại trong hàng chờ; ED4U không tạo bản trùng."
          : "Yêu cầu phòng đã được gửi tới School Admin. Soft hold 24 giờ đã bắt đầu; đây chưa phải đặt phòng được xác nhận.",
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-[var(--hairline)]">
        <CardHeader className="border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)]">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Tìm phòng bằng ngôn ngữ tự nhiên</CardTitle>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Gemini chỉ đề xuất tiêu chí có cấu trúc. Bạn xác nhận dữ liệu trước khi bộ lập kế
                hoạch chạy trên trạng thái phòng trực tiếp.
              </p>
            </div>
            <Badge tone="brand" size="sm">
              Gemini → Facility Engine
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <Field
            id="facility-prompt"
            label="Bạn cần phòng như thế nào?"
            description="Nêu số người, ngày/khung giờ, tiện ích bắt buộc và loại phòng ưu tiên nếu có."
          >
            <Textarea
              id="facility-prompt"
              value={rawText}
              onChange={(event) => setRawText(event.target.value)}
              rows={3}
              placeholder="Ví dụ: 80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên hội trường."
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setRawText(example)}
                className="rounded-full border border-[var(--hairline)] px-3 py-1 text-[11px] text-[var(--body)] hover:bg-[var(--surface-soft)]"
              >
                {example}
              </button>
            ))}
          </div>
          <Button
            type="button"
            variant="secondary"
            size="md"
            disabled={isPending}
            onClick={parsePrompt}
          >
            <Icons.search className="mr-1.5 h-4 w-4" />
            {isPending ? "Đang phân tích…" : "Phân tích yêu cầu"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Xác nhận ràng buộc</CardTitle>
          <p className="text-xs text-[var(--muted)]">
            Các trường dưới đây là dữ liệu thực sự được gửi vào Facility Engine. Ràng buộc cứng
            không bị tự nới.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {notes.length > 0 && (
            <Alert tone="warning" title="Cần bạn xác nhận">
              {notes.join(" ")}
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field id="facility-date" label="Ngày sử dụng" required>
              <Input
                id="facility-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            <Field id="facility-attendees" label="Số người" required>
              <Input
                id="facility-attendees"
                type="number"
                min={1}
                value={attendees}
                onChange={(event) => setAttendees(event.target.value)}
                placeholder="80"
              />
            </Field>
            <Field id="facility-start" label="Bắt đầu" required>
              <Input
                id="facility-start"
                type="time"
                value={start}
                onChange={(event) => setStart(event.target.value)}
              />
            </Field>
            <Field id="facility-end" label="Kết thúc" required>
              <Input
                id="facility-end"
                type="time"
                value={end}
                onChange={(event) => setEnd(event.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Field id="facility-type" label="Loại phòng ưu tiên">
              <Select
                id="facility-type"
                value={preferredRoomType}
                onChange={(event) => setPreferredRoomType(event.target.value)}
              >
                <option value="">Không ưu tiên</option>
                {roomTypes.map((type) => (
                  <option key={type.code} value={type.code}>
                    {type.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--ink)]">Tiện ích bắt buộc</p>
              <div className="flex flex-wrap gap-2">
                {features.map((feature) => {
                  const selected = requiredFeatures.includes(feature.code);
                  return (
                    <button
                      key={feature.code}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setRequiredFeatures((current) =>
                          selected
                            ? current.filter((code) => code !== feature.code)
                            : [...current, feature.code],
                        )
                      }
                      className={`rounded-full border px-3 py-1.5 text-xs ${selected ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--on-primary)]" : "border-[var(--hairline)] bg-[var(--canvas)] text-[var(--body)]"}`}
                    >
                      {feature.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-[var(--body)]">
            <input
              type="checkbox"
              checked={flexible}
              onChange={(event) => setFlexible(event.target.checked)}
            />
            Cho phép gợi ý linh hoạt trong khung giờ đã xác nhận
          </label>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={isPending}
            onClick={runPlanner}
          >
            <Icons.rooms className="mr-1.5 h-4 w-4" />
            {isPending ? "Đang kiểm tra trạng thái phòng…" : "Tìm phương án khả thi"}
          </Button>
        </CardContent>
      </Card>

      {message && (
        <Alert
          tone={message.type === "error" ? "danger" : "success"}
          title={message.type === "error" ? "Không thể tiếp tục" : "Đã ghi nhận"}
        >
          {message.text}
        </Alert>
      )}

      {result && (
        <section className="space-y-3" aria-live="polite">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[var(--ink)]">Kết quả lập kế hoạch</h2>
              <p className="text-xs text-[var(--muted)]">
                {stateSummary
                  ? `${stateSummary.rooms} phòng · ${stateSummary.hardOccupancy} khoảng bận cứng · ${stateSummary.activeSoftHolds} soft hold đang hoạt động · ${stateSummary.timeZone}`
                  : ""}
              </p>
            </div>
            <span className="text-[11px] text-[var(--muted)]">Recommendation ≠ reservation</span>
          </div>

          {result.kind === "NO_SOLUTION" ? (
            <Card className="p-5">
              <h3 className="font-semibold text-[var(--ink)]">
                Không có phương án vượt qua toàn bộ ràng buộc cứng
              </h3>
              <ul className="mt-3 space-y-2 text-sm text-[var(--body)]">
                {result.blockers.map((blocker) => (
                  <li key={blocker.reason}>• {blocker.detail}</li>
                ))}
              </ul>
              <div className="mt-4 border-t border-[var(--hairline-soft)] pt-3 text-xs text-[var(--muted)]">
                {result.alternatives.map((alternative) => (
                  <p key={alternative.description}>{alternative.description}</p>
                ))}
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {(() => {
                const selectedPlan =
                  result.plans.find((plan) => plan.roomId === selectedPlanId) ?? result.plans[0];
                return selectedPlan ? (
                  <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.9fr)_minmax(0,1fr)]">
                    <FacilityRoomMap
                      rooms={roomMap}
                      selectedRoomId={selectedPlan.roomId}
                      onSelect={setSelectedPlanId}
                    />
                    <FacilityFitRadar plan={selectedPlan} />
                    <FacilityReasoning plan={selectedPlan} />
                  </div>
                ) : null;
              })()}

              <div className="grid gap-3 lg:grid-cols-3" aria-label="Các phương án được xếp hạng">
                {result.plans.map((plan, index) => {
                  const isSelected = plan.roomId === selectedPlanId;
                  return (
                    <Card
                      key={plan.roomId}
                      className={`flex h-full flex-col p-5 transition-[border-color,box-shadow] ${isSelected ? "border-[var(--brand-600)] shadow-[var(--shadow-md)]" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                            Phương án {index + 1}
                          </p>
                          <h3 className="mt-1 text-xl font-bold text-[var(--ink)]">
                            {plan.roomCode}
                          </h3>
                        </div>
                        <Badge tone={plan.pendingConflictRisk > 0 ? "warning" : "success"}>
                          {plan.score.toFixed(1)} điểm
                        </Badge>
                      </div>
                      <button
                        type="button"
                        className="mt-3 inline-flex items-center gap-1.5 self-start text-[11px] font-bold text-[var(--primary)] hover:underline"
                        onClick={() => setSelectedPlanId(plan.roomId)}
                        aria-pressed={isSelected}
                      >
                        <Icons.gauge className="h-3.5 w-3.5" aria-hidden="true" />
                        {isSelected ? "Đang xem phân tích" : "Xem radar & reasoning"}
                      </button>
                      <div className="mt-4 space-y-2 text-xs text-[var(--body)]">
                        {plan.reasons.map((reason) => (
                          <p key={reason}>✓ {reason}</p>
                        ))}
                        {plan.tradeoffs.map((tradeoff) => (
                          <p key={tradeoff} className="text-[var(--muted)]">
                            △ {tradeoff}
                          </p>
                        ))}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--hairline-soft)] pt-3 text-[11px] text-[var(--muted)]">
                        <span>Rủi ro soft hold</span>
                        <strong className="text-right text-[var(--ink)]">
                          {Math.round(plan.pendingConflictRisk * 100)}%
                        </strong>
                        <span>Hiệu suất sức chứa</span>
                        <strong className="text-right text-[var(--ink)]">
                          {Math.round(plan.soft.capacityEfficiency * 100)}/100
                        </strong>
                      </div>
                      <Button
                        type="button"
                        variant={index === 0 ? "primary" : "secondary"}
                        size="md"
                        className="mt-auto pt-3"
                        disabled={isPending || !canRequest}
                        onClick={() => requestPlan(plan.roomId)}
                      >
                        {canRequest ? "Gửi yêu cầu phòng này" : "Chỉ học sinh được gửi yêu cầu"}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
