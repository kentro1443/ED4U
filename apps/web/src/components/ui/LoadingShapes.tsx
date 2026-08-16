import { Skeleton } from "./Feedback";

/**
 * Route-shaped loading states.
 *
 * A skeleton earns its place by predicting the layout that replaces it. Showing
 * three stacked cards where a week grid is about to appear makes the page jump
 * and reads as slower than a plain spinner, so each route family gets the shape
 * it will actually resolve into.
 */

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-8 w-56 rounded-xl" />
      <Skeleton className="h-4 w-full max-w-80 rounded-lg" />
    </div>
  );
}

/** Toolbar + rows: for members, audit, rooms, timetable, notifications. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải danh sách">
      <PageHeaderSkeleton />
      <div className="space-y-4 rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-full rounded-xl sm:w-64" />
          <Skeleton className="h-10 w-40 rounded-xl" />
          <Skeleton className="h-10 w-40 rounded-xl" />
        </div>
        <div className="space-y-px overflow-hidden rounded-2xl border border-[var(--hairline)]">
          <Skeleton className="h-10 w-full rounded-none" />
          {Array.from({ length: rows }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Toolbar + week grid: for the calendar and the room schedule. */
export function CalendarSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải lịch">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-56 rounded-xl" />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>
      <div className="overflow-hidden rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-sm)]">
        <div className="grid grid-cols-[3rem_repeat(5,1fr)] gap-px bg-[var(--hairline)]">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={`head-${index}`} className="h-11 rounded-none" />
          ))}
          {Array.from({ length: 30 }).map((_, index) => (
            <Skeleton key={`cell-${index}`} className="h-14 rounded-none" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Stat strip + widget grid: for the dashboard. */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải bảng điều khiển">
      <PageHeaderSkeleton />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}

/** Filter strip + responsive cards: for discovery, rooms, clubs and forums. */
export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải nội dung">
      <PageHeaderSkeleton />
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-full rounded-xl sm:w-72" />
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: cards }).map((_, index) => (
          <Skeleton key={index} className="h-52 rounded-[24px]" />
        ))}
      </div>
    </div>
  );
}

/** Identity header + two-column content: for record and analysis detail routes. */
export function DetailSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải chi tiết">
      <PageHeaderSkeleton />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <Skeleton className="h-80 rounded-[24px]" />
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-[24px]" />
          <Skeleton className="h-40 rounded-[24px]" />
        </div>
      </div>
    </div>
  );
}

/** Settings or structured submission form with an explanatory side panel. */
export function FormSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải biểu mẫu">
      <PageHeaderSkeleton />
      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-5 rounded-[24px] border border-[var(--hairline)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-sm)]">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
        <Skeleton className="h-64 rounded-[24px]" />
      </div>
    </div>
  );
}
