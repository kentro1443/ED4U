"use client";

import { useState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Icons } from "@/components/ui/icons";
import { bookMentorSlotAction } from "./bookingActions";
import { nextSlotOccurrence, parseSlotPattern } from "@ed4u/domain";

export function MentorBookingCard({
  mentorId,
  mentorName,
  pricePerHour,
  availability,
  recommendationRunId,
  verified,
  timeZone = "Asia/Ho_Chi_Minh",
}: {
  mentorId: string;
  mentorName: string;
  pricePerHour: number;
  availability: string[];
  recommendationRunId?: string | null;
  verified: boolean;
  timeZone?: string;
}) {
  const [selectedSlot, setSelectedSlot] = useState<string>(availability[0] ?? "");
  const [isBooking, setIsBooking] = useState(false);
  const [result, setResult] = useState<
    | { type: "success"; message: string; startAt: string; endAt: string }
    | { type: "error"; message: string }
    | null
  >(null);

  const handleBooking = async () => {
    if (!selectedSlot) return;
    setIsBooking(true);
    setResult(null);

    const res = await bookMentorSlotAction({
      mentorId,
      slotPattern: selectedSlot,
      recommendationRunId,
    });

    setIsBooking(false);

    if (!res.ok) {
      setResult({ type: "error", message: res.error });
    } else {
      setResult({
        type: "success",
        message: res.message,
        startAt: res.startAt,
        endAt: res.endAt,
      });
    }
  };

  const formattedSlots = availability.map((slot) => {
    try {
      const parsed = parseSlotPattern(slot);
      const occurrence = nextSlotOccurrence(slot, timeZone, new Date());
      const concreteLabel = new Intl.DateTimeFormat("vi-VN", {
        timeZone,
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(occurrence.startAt);
      return { pattern: slot, label: `${parsed.label} · gần nhất ${concreteLabel}` };
    } catch {
      return { pattern: slot, label: slot };
    }
  });

  const radioGroupName = useId();

  return (
    <Card className="border-[var(--hairline)] bg-[var(--canvas)] shadow-xs">
      <CardHeader className="pb-3 border-b border-[var(--hairline-soft)]">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold text-[var(--ink)]">
            Đặt lịch học cùng Mentor
          </CardTitle>
          <Badge tone={verified ? "success" : "neutral"} size="sm">
            {verified ? "Đã xác minh" : "Chưa xác minh"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        {result?.type === "success" && (
          <Alert tone="success" title="Đặt lịch hẹn thành công!">
            <div className="space-y-1 text-xs">
              <p>{result.message}</p>
              <p className="font-semibold">
                Thời gian: {new Date(result.startAt).toLocaleString("vi-VN", { timeZone })}
              </p>
              <p className="text-[var(--muted)]">
                Lịch hẹn đã được lưu vào hệ thống và gửi thông báo tới Mentor.
              </p>
            </div>
          </Alert>
        )}

        {result?.type === "error" && (
          <Alert tone="danger" title="Không thể đặt lịch">
            {result.message}
          </Alert>
        )}

        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--muted)]">Mức học phí:</span>
          <span className="font-bold text-base text-[var(--ink)]">
            {pricePerHour.toLocaleString("vi-VN")} đ{" "}
            <span className="text-xs font-normal text-[var(--muted)]">/ buổi (60 phút)</span>
          </span>
        </div>

        {recommendationRunId && (
          <div className="rounded-md bg-[var(--surface-soft)] p-2.5 text-xs text-[var(--muted)] flex items-center gap-2">
            <Icons.matchSpace className="h-4 w-4 text-[var(--brand-accent)] shrink-0" />
            <span>Liên kết từ kết quả gợi ý Match Space (Áp dụng trần giá đã tìm kiếm)</span>
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold text-[var(--ink)] block">
            Chọn khung giờ rảnh của Mentor:
          </label>

          {formattedSlots.length > 0 ? (
            <div className="grid grid-cols-1 gap-2">
              {formattedSlots.map((slot) => (
                <label
                  key={slot.pattern}
                  className={`flex items-center justify-between rounded-lg border p-3 text-xs font-medium cursor-pointer transition-colors ${
                    selectedSlot === slot.pattern
                      ? "border-[var(--primary)] bg-[var(--surface-soft)] text-[var(--ink)] shadow-xs"
                      : "border-[var(--hairline)] hover:border-[var(--muted)] text-[var(--body)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={radioGroupName}
                      value={slot.pattern}
                      checked={selectedSlot === slot.pattern}
                      onChange={() => setSelectedSlot(slot.pattern)}
                      className="accent-[var(--primary)]"
                    />
                    <span>{slot.label}</span>
                  </div>
                  <span className="text-[11px] text-[var(--muted)]">60 phút</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--muted)] italic">
              Mentor hiện chưa cập nhật lịch rảnh hằng tuần.
            </p>
          )}
        </div>

        <Button
          type="button"
          variant="primary"
          size="md"
          loading={isBooking}
          disabled={formattedSlots.length === 0 || !selectedSlot || result?.type === "success"}
          onClick={handleBooking}
          className="w-full mt-2 shadow-sm"
        >
          <Icons.appointments className="h-4 w-4 mr-1.5" />
          {result?.type === "success" ? "Đã đặt lịch" : "Xác nhận đặt lịch hẹn"}
        </Button>

        <p className="text-[11px] text-center text-[var(--muted)] leading-relaxed">
          Giao dịch được kiểm tra trực tiếp theo thời gian thực (Live Recheck). Không tự động trừ
          tiền.
        </p>
      </CardContent>
    </Card>
  );
}
