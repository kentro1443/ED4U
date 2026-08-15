import type { CalendarSource } from "@ed4u/domain";
import {
  addCivilDays,
  civilDateKey,
  civilDateTimeToInstant,
  civilInZone,
  schoolWeekMonday,
} from "@ed4u/domain";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";

export interface CalendarViewItem {
  id: string;
  source: CalendarSource;
  title: string;
  startAt: Date;
  endAt: Date;
  roomLabel?: string | null;
}

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
const SOURCE_LABEL: Record<CalendarSource, string> = {
  TIMETABLE: "Thời khóa biểu",
  APPOINTMENT: "Lịch hẹn",
  MENTOR_BOOKING: "Mentor",
  CLUB_EVENT: "CLB",
  SCHOOL_EVENT: "Sự kiện trường",
  ROOM_BOOKING: "Đặt phòng",
};

const SOURCE_CLASS: Record<CalendarSource, string> = {
  TIMETABLE: "border-slate-300 bg-slate-50",
  APPOINTMENT: "border-amber-300 bg-amber-50",
  MENTOR_BOOKING: "border-blue-300 bg-blue-50",
  CLUB_EVENT: "border-violet-300 bg-violet-50",
  SCHOOL_EVENT: "border-emerald-300 bg-emerald-50",
  ROOM_BOOKING: "border-orange-300 bg-orange-50",
};

function localParts(item: CalendarViewItem, timeZone: string) {
  const start = civilInZone(item.startAt, timeZone);
  const end = civilInZone(item.endAt, timeZone);
  return { start, end, dateKey: civilDateKey(start) };
}

function timeLabel(item: CalendarViewItem, timeZone: string): string {
  const format = new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${format.format(item.startAt)}–${format.format(item.endAt)}`;
}

function EventCard({
  item,
  timeZone,
  compact = false,
}: {
  item: CalendarViewItem;
  timeZone: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-2 py-1.5 ${SOURCE_CLASS[item.source]} ${compact ? "text-[10px]" : "text-xs"}`}
    >
      <p className="truncate font-semibold text-[var(--ink)]">{item.title}</p>
      <p className="truncate text-[var(--muted)]">
        {timeLabel(item, timeZone)}
        {item.roomLabel ? ` · ${item.roomLabel}` : ""}
      </p>
    </div>
  );
}

export function CalendarLegend() {
  return (
    <div className="flex flex-wrap gap-2" aria-label="Chú giải nguồn lịch">
      {(Object.keys(SOURCE_LABEL) as CalendarSource[]).map((source) => (
        <Badge key={source} tone="neutral" size="sm">
          {SOURCE_LABEL[source]}
        </Badge>
      ))}
    </div>
  );
}

export function WeekCalendar({
  items,
  anchor,
  timeZone,
}: {
  items: CalendarViewItem[];
  anchor: Date;
  timeZone: string;
}) {
  const monday = schoolWeekMonday(anchor, timeZone);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addCivilDays(monday, index);
    return { ...date, key: civilDateKey(date), label: DAY_LABELS[index]! };
  });
  const startMinute = 7 * 60;
  const endMinute = 23 * 60;
  const totalMinutes = endMinute - startMinute;
  const hourRows = Array.from({ length: 17 }, (_, i) => 7 + i);

  return (
    <>
      <Card className="hidden overflow-hidden p-0 md:block">
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))] border-b border-[var(--hairline)] bg-[var(--surface-soft)]">
          <div className="p-2 text-[10px] font-semibold uppercase text-[var(--muted)]">Giờ</div>
          {days.map((day) => (
            <div key={day.key} className="border-l border-[var(--hairline)] p-2 text-center">
              <p className="text-xs font-semibold text-[var(--ink)]">{day.label}</p>
              <p className="text-[10px] text-[var(--muted)]">
                {String(day.day).padStart(2, "0")}/{String(day.month).padStart(2, "0")}
              </p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[64px_repeat(7,minmax(0,1fr))]">
          <div className="relative h-[840px] bg-[var(--surface-soft)]">
            {hourRows.map((hour, index) => (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t border-[var(--hairline-soft)] px-2 text-[10px] text-[var(--muted)]"
                style={{ top: `${(index / 16) * 100}%` }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          {days.map((day) => {
            const dayItems = items.filter((item) => localParts(item, timeZone).dateKey === day.key);
            return (
              <div
                key={day.key}
                className="relative h-[840px] border-l border-[var(--hairline)] bg-[var(--canvas)]"
              >
                {hourRows.map((hour, index) => (
                  <div
                    key={hour}
                    className="pointer-events-none absolute left-0 right-0 border-t border-[var(--hairline-soft)]"
                    style={{ top: `${(index / 16) * 100}%` }}
                  />
                ))}
                {dayItems.map((item) => {
                  const { start, end } = localParts(item, timeZone);
                  const eventStart = start.hour * 60 + start.minute;
                  const eventEnd = end.hour * 60 + end.minute;
                  const clampedStart = Math.max(startMinute, Math.min(endMinute, eventStart));
                  const clampedEnd = Math.max(clampedStart + 15, Math.min(endMinute, eventEnd));
                  const top = ((clampedStart - startMinute) / totalMinutes) * 100;
                  const height = Math.max(2.8, ((clampedEnd - clampedStart) / totalMinutes) * 100);
                  return (
                    <div
                      key={`${item.source}-${item.id}`}
                      className="absolute left-1 right-1 z-10"
                      style={{ top: `${top}%`, height: `${height}%` }}
                    >
                      <EventCard item={item} timeZone={timeZone} compact />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-4 md:hidden">
        {days.map((day) => {
          const dayItems = items.filter((item) => localParts(item, timeZone).dateKey === day.key);
          return (
            <section key={day.key}>
              <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">
                {day.label} · {String(day.day).padStart(2, "0")}/
                {String(day.month).padStart(2, "0")}
              </h3>
              <div className="space-y-2">
                {dayItems.length ? (
                  dayItems.map((item) => (
                    <EventCard key={`${item.source}-${item.id}`} item={item} timeZone={timeZone} />
                  ))
                ) : (
                  <p className="text-xs text-[var(--muted)]">Không có lịch.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

export function DayCalendar({
  items,
  anchor,
  timeZone,
}: {
  items: CalendarViewItem[];
  anchor: Date;
  timeZone: string;
}) {
  const key = civilDateKey(civilInZone(anchor, timeZone));
  const dayItems = items
    .filter((item) => localParts(item, timeZone).dateKey === key)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  return (
    <Card className="p-0">
      <div className="divide-y divide-[var(--hairline-soft)]">
        {dayItems.length ? (
          dayItems.map((item) => (
            <div key={`${item.source}-${item.id}`} className="grid grid-cols-[92px_1fr] gap-3 p-4">
              <time className="text-xs font-semibold text-[var(--muted)]">
                {timeLabel(item, timeZone)}
              </time>
              <EventCard item={item} timeZone={timeZone} />
            </div>
          ))
        ) : (
          <p className="p-8 text-center text-sm text-[var(--muted)]">
            Không có lịch trong ngày này.
          </p>
        )}
      </div>
    </Card>
  );
}

export function MonthCalendar({
  items,
  anchor,
  timeZone,
}: {
  items: CalendarViewItem[];
  anchor: Date;
  timeZone: string;
}) {
  const anchorCivil = civilInZone(anchor, timeZone);
  const first = { year: anchorCivil.year, month: anchorCivil.month, day: 1 };
  const firstInstantWeekday = civilInZone(
    civilDateTimeToInstant({ ...first, hour: 12, minute: 0 }, timeZone),
    timeZone,
  ).weekday;
  const mondayOffset = firstInstantWeekday === 0 ? -6 : 1 - firstInstantWeekday;
  const gridStart = addCivilDays(first, mondayOffset);
  const cells = Array.from({ length: 42 }, (_, index) => addCivilDays(gridStart, index));

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-7 border-b border-[var(--hairline)] bg-[var(--surface-soft)]">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="p-2 text-center text-[10px] font-semibold uppercase text-[var(--muted)]"
          >
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date) => {
          const key = civilDateKey(date);
          const dayItems = items
            .filter((item) => localParts(item, timeZone).dateKey === key)
            .slice(0, 3);
          const inMonth = date.month === anchorCivil.month;
          return (
            <div
              key={key}
              className={`min-h-28 border-b border-r border-[var(--hairline-soft)] p-2 ${inMonth ? "bg-[var(--canvas)]" : "bg-[var(--surface-soft)] opacity-60"}`}
            >
              <span className="text-xs font-semibold text-[var(--muted)]">{date.day}</span>
              <div className="mt-1 space-y-1">
                {dayItems.map((item) => (
                  <EventCard
                    key={`${item.source}-${item.id}`}
                    item={item}
                    timeZone={timeZone}
                    compact
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
