"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PlanResult } from "@ed4u/facility-engine";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Icons } from "@/components/ui/icons";
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
}

const EXAMPLES = [
  "80 người, chiều thứ Sáu, cần máy chiếu, ưu tiên hội trường",
  "35 người, sáng thứ Ba, cần máy tính, ưu tiên phòng máy",
  "20 người, thứ Năm từ 18:00-20:00, cần máy chiếu",
] as const;

export function FacilityPlanner({ roomTypes, features, canRequest }: PlannerProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [rawText, setRawText] = useState("");
  const [date, setDate] = useState("");
  const [attendees, setAttendees] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [preferredRoomType, setPreferredRoomType] = useState("");
  const [requiredFeatures, setRequiredFeatures] = useState<string[]>([]);
  const [flexible, setFlexible] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [result, setResult] = useState<PlanResult | null>(null);
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
      setStateSummary(response.stateSummary);
    });
  };

  const requestPlan = (roomId: string) => {
    const input = criteria();
    if (!input) return;
    startTransition(async () => {
      const response = await createRoomRequestFromPlanAction({ criteria: input, roomId });
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
                Parser chỉ đề xuất tiêu chí. Bạn xác nhận dữ liệu trước khi bộ lập kế hoạch chạy
                trên trạng thái phòng trực tiếp.
              </p>
            </div>
            <Badge tone="brand" size="sm">
              Facility Intelligence Engine
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
            <div className="grid gap-4 lg:grid-cols-3">
              {result.plans.map((plan, index) => (
                <Card key={plan.roomId} className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                        Phương án {index + 1}
                      </p>
                      <h3 className="mt-1 text-xl font-bold text-[var(--ink)]">{plan.roomCode}</h3>
                    </div>
                    <Badge tone={plan.pendingConflictRisk > 0 ? "warning" : "success"}>
                      {plan.score.toFixed(1)} điểm
                    </Badge>
                  </div>
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
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
