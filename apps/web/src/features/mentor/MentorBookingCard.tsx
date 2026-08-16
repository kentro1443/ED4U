"use client";

import { useState, useId } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Feedback";
import { Dialog } from "@/components/ui/Overlays";
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
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [result, setResult] = useState<
    | { type: "success"; message: string; startAt: string; endAt: string }
    | { type: "waitlisted"; mentorName: string; slotLabel: string | null }
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

    if (res.ok) {
      setResult({
        type: "success",
        message: res.message,
        startAt: res.startAt,
        endAt: res.endAt,
      });
    } else if (res.waitlisted) {
      // DEMO-ONLY branch: nothing was booked, but the mentor was really notified.
      setResult({ type: "waitlisted", mentorName: res.mentorName, slotLabel: res.slotLabel });
      setWaitlistOpen(true);
    } else {
      setResult({ type: "error", message: res.error });
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

        {result?.type === "waitlisted" && (
          <Alert tone="info" title="Bạn đang ở danh sách chờ">
            <div className="space-y-1 text-xs">
              <p>
                Khung giờ {result.slotLabel ?? "đã chọn"} chưa mở đặt lịch được. Bạn đã được thêm
                vào danh sách chờ của {result.mentorName}.
              </p>
              <p className="text-[var(--muted)]">
                Mentor đã nhận được thông báo và sẽ liên hệ nếu sắp xếp được.
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
          {result?.type === "success"
            ? "Đã đặt lịch"
            : result?.type === "waitlisted"
              ? "Thử khung giờ khác"
              : "Xác nhận đặt lịch hẹn"}
        </Button>

        <p className="text-[11px] text-center text-[var(--muted)] leading-relaxed">
          Giao dịch được kiểm tra trực tiếp theo thời gian thực (Live Recheck). Không tự động trừ
          tiền.
        </p>
      </CardContent>

      {/* DEMO-ONLY: shown instead of a failure when DEMO_MENTOR_WAITLIST is on. */}
      <Dialog
        open={waitlistOpen && result?.type === "waitlisted"}
        onOpenChange={setWaitlistOpen}
        title="Đã thêm bạn vào danh sách chờ"
        description={
          result?.type === "waitlisted"
            ? `${result.mentorName} đã nhận được thông báo về yêu cầu của bạn.`
            : undefined
        }
      >
        {result?.type === "waitlisted" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface-soft)] p-4">
              <Icons.info className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-accent)]" />
              <div className="space-y-1 text-sm text-[var(--body)]">
                <p>
                  Khung giờ <span className="font-semibold">{result.slotLabel ?? "bạn chọn"}</span>{" "}
                  hiện chưa mở đặt lịch được, nên yêu cầu của bạn được chuyển thành đăng ký chờ.
                </p>
                <p className="text-[var(--muted)]">
                  Đây chưa phải lịch hẹn đã xác nhận — chưa có buổi học nào được giữ chỗ.
                </p>
              </div>
            </div>

            <ul className="space-y-2 text-sm text-[var(--body)]">
              <li className="flex items-start gap-2">
                <Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>{result.mentorName} đã được gửi thông báo trong hộp thư ED4U.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Mentor sẽ liên hệ lại nếu sắp xếp hoặc mở thêm được khung giờ này.</span>
              </li>
              <li className="flex items-start gap-2">
                <Icons.check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>Bạn vẫn có thể chọn một khung giờ khác để đặt lịch ngay bây giờ.</span>
              </li>
            </ul>

            <Button
              type="button"
              variant="primary"
              size="md"
              className="w-full"
              onClick={() => setWaitlistOpen(false)}
            >
              Đã hiểu
            </Button>
          </div>
        )}
      </Dialog>
    </Card>
  );
}
