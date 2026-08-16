/**
 * School-local formatting.
 *
 * Every stored timestamp is a real instant; every value a user reads is civil
 * time in their school's IANA zone. These helpers are the only place that
 * conversion is written, so no page can accidentally fall back to server-local
 * time by reaching for `toISOString()` or `getHours()`.
 */

const LOCALE = "vi-VN";

export function formatDateTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "14:00 → 16:00 Thứ Hai, 17/08" — a single readable slot label. */
export function formatSlot(start: Date, end: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat(LOCALE, {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  }).format(start);
  return `${formatTime(start, timeZone)} → ${formatTime(end, timeZone)} · ${day}`;
}

/** Minutes-from-midnight (as stored by OperationalHours) to "07:00". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * Age of a pending item, for queue triage. Deliberately coarse: an approver
 * needs "3 ngày" to spot a stale request, not a precise duration.
 */
export function formatAge(since: Date, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000));
  if (minutes < 1) return "vừa xong";
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} ngày trước`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} tháng trước`;
  return `${Math.floor(months / 12)} năm trước`;
}

/** How urgently a queue item should read, from how long it has waited. */
export function ageTone(since: Date, now: Date = new Date()): "neutral" | "warning" | "danger" {
  const hours = (now.getTime() - since.getTime()) / 3_600_000;
  if (hours >= 72) return "danger";
  if (hours >= 24) return "warning";
  return "neutral";
}
