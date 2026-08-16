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
      <Skeleton className="h-8 w-56 rounded-lg" />
      <Skeleton className="h-4 w-80 rounded-md" />
    </div>
  );
}

/** Toolbar + rows: for members, audit, rooms, timetable, notifications. */
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải danh sách">
      <PageHeaderSkeleton />
      <div className="space-y-4 rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-5">
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-full rounded-md sm:w-64" />
          <Skeleton className="h-9 w-40 rounded-md" />
          <Skeleton className="h-9 w-40 rounded-md" />
        </div>
        <div className="space-y-px overflow-hidden rounded-lg border border-[var(--hairline)]">
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
        <Skeleton className="h-10 w-56 rounded-lg" />
        <Skeleton className="h-10 w-44 rounded-lg" />
      </div>
      <div className="overflow-hidden rounded-xl border border-[var(--hairline)]">
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
          <Skeleton key={index} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
