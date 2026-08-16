import type { CalendarSource } from "@ed4u/domain";
import {
  addCivilDays,
  civilDateKey,
  civilDateTimeToInstant,
  civilInZone,
  schoolWeekMonday,
} from "@ed4u/domain";
import { Card } from "@/components/ui/Card";
import { Icons, type IconType } from "@/components/ui/icons";

export interface CalendarViewItem {
  id: string;
  source: CalendarSource;
  title: string;
  startAt: Date;
  endAt: Date;
  roomLabel?: string | null;
}

interface CalendarCluster {
  key: string;
  item: CalendarViewItem;
  items: CalendarViewItem[];
}

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;
const START_HOUR = 7;
const END_HOUR = 23;
const START_MINUTE = START_HOUR * 60;
const END_MINUTE = END_HOUR * 60;
const TOTAL_MINUTES = END_MINUTE - START_MINUTE;
const TIMELINE_HEIGHT = 960;

const SOURCE_META: Record<
  CalendarSource,
  {
    label: string;
    icon: IconType;
    eventClass: string;
    iconClass: string;
    dotClass: string;
  }
> = {
  TIMETABLE: {
    label: "Thời khóa biểu",
    icon: "timetable",
    eventClass: "border-slate-300 bg-slate-50 text-slate-950",
    iconClass: "bg-slate-200 text-slate-700",
    dotClass: "bg-slate-500",
  },
  APPOINTMENT: {
    label: "Lịch hẹn",
    icon: "appointment",
    eventClass: "border-amber-300 bg-amber-50 text-amber-950",
    iconClass: "bg-amber-100 text-amber-800",
    dotClass: "bg-amber-500",
  },
  MENTOR_BOOKING: {
    label: "Mentor",
    icon: "mentor",
    eventClass: "border-blue-300 bg-blue-50 text-blue-950",
    iconClass: "bg-blue-100 text-blue-800",
    dotClass: "bg-blue-500",
  },
  CLUB_EVENT: {
    label: "CLB",
    icon: "clubs",
    eventClass: "border-violet-300 bg-violet-50 text-violet-950",
    iconClass: "bg-violet-100 text-violet-800",
    dotClass: "bg-violet-500",
  },
  SCHOOL_EVENT: {
    label: "Sự kiện trường",
    icon: "announcement",
    eventClass: "border-emerald-300 bg-emerald-50 text-emerald-950",
    iconClass: "bg-emerald-100 text-emerald-800",
    dotClass: "bg-emerald-500",
  },
  ROOM_BOOKING: {
    label: "Đặt phòng",
    icon: "roomDoor",
    eventClass: "border-orange-300 bg-orange-50 text-orange-950",
    iconClass: "bg-orange-100 text-orange-800",
    dotClass: "bg-orange-500",
  },
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

function clustersForDate(items: CalendarViewItem[], dateKey: string, timeZone: string) {
  const groups = new Map<string, CalendarViewItem[]>();
  for (const item of items) {
    if (localParts(item, timeZone).dateKey !== dateKey) continue;
    const key = `${item.source}:${item.startAt.getTime()}:${item.endAt.getTime()}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, item: group[0]!, items: group }))
    .sort((a, b) => a.item.startAt.getTime() - b.item.startAt.getTime());
}

function clusterTitle(cluster: CalendarCluster) {
  if (cluster.items.length === 1) return cluster.item.title;
  if (cluster.item.source === "TIMETABLE") {
    return `${cluster.item.title} +${cluster.items.length - 1} lớp`;
  }
  return `${cluster.item.title} · +${cluster.items.length - 1}`;
}

function clusterDescription(cluster: CalendarCluster) {
  return cluster.items.map((item) => item.title).join("; ");
}

function EventCard({
  cluster,
  timeZone,
  compact = false,
}: {
  cluster: CalendarCluster;
  timeZone: string;
  compact?: boolean;
}) {
  const meta = SOURCE_META[cluster.item.source];
  const Icon = Icons[meta.icon];
  return (
    <article
      className={`h-full min-h-10 overflow-hidden rounded-xl border px-2 py-1.5 shadow-[0_1px_1px_rgba(15,23,42,.04)] ${meta.eventClass}`}
      title={clusterDescription(cluster)}
      aria-label={`${meta.label}: ${clusterTitle(cluster)}, ${timeLabel(cluster.item, timeZone)}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${meta.iconClass}`}
          aria-hidden="true"
        >
          <Icon className="h-3 w-3" strokeWidth={2} />
        </span>
        <p className={`truncate font-bold ${compact ? "text-[10px]" : "text-xs"}`}>
          {clusterTitle(cluster)}
        </p>
      </div>
      <p className={`mt-0.5 truncate opacity-70 ${compact ? "text-[9px]" : "text-[11px]"}`}>
        {timeLabel(cluster.item, timeZone)}
        {cluster.item.roomLabel ? ` · ${cluster.item.roomLabel}` : ""}
      </p>
    </article>
  );
}

function MobileAgendaDay({
  label,
  dateLabel,
  clusters,
  timeZone,
  isToday,
}: {
  label: string;
  dateLabel: string;
  clusters: CalendarCluster[];
  timeZone: string;
  isToday: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)]">
      <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--surface-soft)] px-4 py-3">
        <h3 className="text-sm font-bold text-[var(--ink)]">
          {label} · {dateLabel}
        </h3>
        {isToday ? (
          <span className="text-[10px] font-bold text-[var(--primary)]">Hôm nay</span>
        ) : null}
      </div>
      <div className="space-y-2 p-3">
        {clusters.length ? (
          clusters.map((cluster) => (
            <EventCard key={cluster.key} cluster={cluster} timeZone={timeZone} />
          ))
        ) : (
          <p className="px-1 py-3 text-xs text-[var(--muted)]">Không có lịch.</p>
        )}
      </div>
    </section>
  );
}

export function CalendarLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-2" aria-label="Chú giải nguồn lịch">
      {(Object.keys(SOURCE_META) as CalendarSource[]).map((source) => {
        const meta = SOURCE_META[source];
        const Icon = Icons[meta.icon];
        return (
          <li
            key={source}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--body)]"
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md ${meta.iconClass}`}
            >
              <Icon className="h-3 w-3" aria-hidden="true" />
            </span>
            {meta.label}
          </li>
        );
      })}
    </ul>
  );
}

function CurrentTimeLine({ dateKey, timeZone }: { dateKey: string; timeZone: string }) {
  const now = new Date();
  const local = civilInZone(now, timeZone);
  if (civilDateKey(local) !== dateKey) return null;
  const minute = local.hour * 60 + local.minute;
  if (minute < START_MINUTE || minute > END_MINUTE) return null;
  const top = ((minute - START_MINUTE) / TOTAL_MINUTES) * 100;
  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 border-t-2 border-[var(--danger)]"
      style={{ top: `${top}%` }}
      aria-hidden="true"
    >
      <span className="absolute -left-1 -top-1.5 h-3 w-3 rounded-full bg-[var(--danger)]" />
    </div>
  );
}

function HourGrid() {
  return (
    <>
      {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => START_HOUR + index).map(
        (hour) => (
          <div
            key={hour}
            className="pointer-events-none absolute left-0 right-0 border-t border-[var(--hairline-soft)]"
            style={{ top: `${((hour - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%` }}
          />
        ),
      )}
    </>
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
  const todayKey = civilDateKey(civilInZone(new Date(), timeZone));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addCivilDays(monday, index);
    return { ...date, key: civilDateKey(date), label: DAY_LABELS[index]! };
  });

  return (
    <>
      <Card className="hidden overflow-x-auto p-0 md:block" data-testid="week-calendar-grid">
        <div className="min-w-[940px]">
          <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-[var(--hairline)] bg-[var(--surface-card)]">
            <div className="flex items-end p-3 text-[10px] font-semibold text-[var(--muted)]">
              GMT+7
            </div>
            {days.map((day) => {
              const isToday = day.key === todayKey;
              return (
                <div
                  key={day.key}
                  className={`border-l border-[var(--hairline)] px-2 py-3 text-center ${isToday ? "bg-[var(--brand-50)]" : ""}`}
                >
                  <p
                    className={`text-[11px] font-bold ${isToday ? "text-[var(--primary)]" : "text-[var(--muted)]"}`}
                  >
                    {day.label}
                  </p>
                  <p
                    className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold tabular-nums ${isToday ? "bg-[var(--primary)] text-white" : "text-[var(--ink)]"}`}
                  >
                    {day.day}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))]">
            <div className="relative bg-[var(--surface-soft)]" style={{ height: TIMELINE_HEIGHT }}>
              {Array.from(
                { length: END_HOUR - START_HOUR + 1 },
                (_, index) => START_HOUR + index,
              ).map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 right-0 -translate-y-1/2 px-2 text-right text-[10px] tabular-nums text-[var(--muted)]"
                  style={{ top: `${((hour - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%` }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day) => {
              const clusters = clustersForDate(items, day.key, timeZone);
              return (
                <div
                  key={day.key}
                  className={`relative border-l border-[var(--hairline)] ${day.key === todayKey ? "bg-[var(--brand-50)]/45" : "bg-[var(--surface-card)]"}`}
                  style={{ height: TIMELINE_HEIGHT }}
                >
                  <HourGrid />
                  <CurrentTimeLine dateKey={day.key} timeZone={timeZone} />
                  {clusters.map((cluster) => {
                    const { start, end } = localParts(cluster.item, timeZone);
                    const eventStart = start.hour * 60 + start.minute;
                    const eventEnd = end.hour * 60 + end.minute;
                    const clampedStart = Math.max(START_MINUTE, Math.min(END_MINUTE, eventStart));
                    const clampedEnd = Math.max(clampedStart + 15, Math.min(END_MINUTE, eventEnd));
                    const top = ((clampedStart - START_MINUTE) / TOTAL_MINUTES) * 100;
                    const height = Math.max(
                      4.8,
                      ((clampedEnd - clampedStart) / TOTAL_MINUTES) * 100,
                    );
                    return (
                      <div
                        key={cluster.key}
                        className="absolute left-1 right-1 z-10"
                        style={{ top: `${top}%`, height: `${height}%` }}
                      >
                        <EventCard cluster={cluster} timeZone={timeZone} compact />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="space-y-3 md:hidden" data-testid="week-calendar-agenda">
        {days.map((day) => (
          <MobileAgendaDay
            key={day.key}
            label={day.label}
            dateLabel={`${String(day.day).padStart(2, "0")}/${String(day.month).padStart(2, "0")}`}
            clusters={clustersForDate(items, day.key, timeZone)}
            timeZone={timeZone}
            isToday={day.key === todayKey}
          />
        ))}
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
  const clusters = clustersForDate(items, key, timeZone);
  const local = civilInZone(anchor, timeZone);
  const dayLabel = new Intl.DateTimeFormat("vi-VN", { timeZone, weekday: "long" }).format(anchor);

  return (
    <>
      <Card className="hidden overflow-hidden p-0 md:block" data-testid="day-calendar-grid">
        <div className="grid grid-cols-[76px_1fr] border-b border-[var(--hairline)] bg-[var(--surface-card)]">
          <div className="p-3 text-[10px] font-semibold text-[var(--muted)]">GMT+7</div>
          <div className="flex items-center gap-3 border-l border-[var(--hairline)] px-4 py-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary)] text-sm font-extrabold text-white">
              {local.day}
            </span>
            <div>
              <p className="text-sm font-bold capitalize text-[var(--ink)]">{dayLabel}</p>
              <p className="text-[11px] text-[var(--muted)]">
                {clusters.reduce((sum, cluster) => sum + cluster.items.length, 0)} hoạt động
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-[76px_1fr]">
          <div className="relative bg-[var(--surface-soft)]" style={{ height: TIMELINE_HEIGHT }}>
            {Array.from(
              { length: END_HOUR - START_HOUR + 1 },
              (_, index) => START_HOUR + index,
            ).map((hour) => (
              <div
                key={hour}
                className="absolute left-0 right-0 -translate-y-1/2 px-2 text-right text-[10px] tabular-nums text-[var(--muted)]"
                style={{ top: `${((hour - START_HOUR) / (END_HOUR - START_HOUR)) * 100}%` }}
              >
                {String(hour).padStart(2, "0")}:00
              </div>
            ))}
          </div>
          <div
            className="relative border-l border-[var(--hairline)] bg-[var(--surface-card)]"
            style={{ height: TIMELINE_HEIGHT }}
          >
            <HourGrid />
            <CurrentTimeLine dateKey={key} timeZone={timeZone} />
            {clusters.map((cluster) => {
              const { start, end } = localParts(cluster.item, timeZone);
              const eventStart = start.hour * 60 + start.minute;
              const eventEnd = end.hour * 60 + end.minute;
              const clampedStart = Math.max(START_MINUTE, Math.min(END_MINUTE, eventStart));
              const clampedEnd = Math.max(clampedStart + 15, Math.min(END_MINUTE, eventEnd));
              const top = ((clampedStart - START_MINUTE) / TOTAL_MINUTES) * 100;
              const height = Math.max(4.8, ((clampedEnd - clampedStart) / TOTAL_MINUTES) * 100);
              return (
                <div
                  key={cluster.key}
                  className="absolute left-3 right-3 z-10 max-w-2xl"
                  style={{ top: `${top}%`, height: `${height}%` }}
                >
                  <EventCard cluster={cluster} timeZone={timeZone} />
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="md:hidden">
        <MobileAgendaDay
          label={dayLabel}
          dateLabel={`${String(local.day).padStart(2, "0")}/${String(local.month).padStart(2, "0")}`}
          clusters={clusters}
          timeZone={timeZone}
          isToday={key === civilDateKey(civilInZone(new Date(), timeZone))}
        />
      </div>
    </>
  );
}

function MonthEventChip({ cluster, timeZone }: { cluster: CalendarCluster; timeZone: string }) {
  const meta = SOURCE_META[cluster.item.source];
  const Icon = Icons[meta.icon];
  return (
    <div
      className={`flex min-w-0 items-center gap-1 rounded-lg border px-1.5 py-1 ${meta.eventClass}`}
      title={`${timeLabel(cluster.item, timeZone)} · ${clusterDescription(cluster)}`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate text-[9px] font-bold">{clusterTitle(cluster)}</span>
    </div>
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
  const todayKey = civilDateKey(civilInZone(new Date(), timeZone));

  return (
    <Card className="overflow-x-auto p-0" data-testid="month-calendar-grid">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-7 border-b border-[var(--hairline)] bg-[var(--surface-card)]">
          {DAY_LABELS.map((label) => (
            <div key={label} className="p-3 text-center text-[10px] font-bold text-[var(--muted)]">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((date, index) => {
            const key = civilDateKey(date);
            const clusters = clustersForDate(items, key, timeZone);
            const visible = clusters.slice(0, 3);
            const hiddenCount = clusters
              .slice(3)
              .reduce((sum, cluster) => sum + cluster.items.length, 0);
            const inMonth = date.month === anchorCivil.month;
            const isToday = key === todayKey;
            const isWeekend = index % 7 >= 5;
            return (
              <section
                key={key}
                aria-label={`${String(date.day).padStart(2, "0")}/${String(date.month).padStart(2, "0")}, ${clusters.reduce((sum, cluster) => sum + cluster.items.length, 0)} hoạt động`}
                className={`min-h-32 border-b border-r border-[var(--hairline-soft)] p-2 ${inMonth ? (isWeekend ? "bg-[var(--surface-soft)]/50" : "bg-[var(--surface-card)]") : "bg-[var(--surface-soft)] opacity-55"}`}
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold tabular-nums ${isToday ? "bg-[var(--primary)] text-white" : "text-[var(--body)]"}`}
                >
                  {date.day}
                </span>
                <div className="mt-1.5 space-y-1">
                  {visible.map((cluster) => (
                    <MonthEventChip key={cluster.key} cluster={cluster} timeZone={timeZone} />
                  ))}
                  {hiddenCount > 0 ? (
                    <p className="px-1 text-[9px] font-bold text-[var(--primary)]">
                      +{hiddenCount} lịch khác
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
