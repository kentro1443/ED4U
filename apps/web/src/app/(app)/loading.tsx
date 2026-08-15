import { Skeleton } from "@/components/ui/Feedback";

export default function Loading() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Đang tải trang">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>

      <div className="rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-6 space-y-4">
        <Skeleton className="h-6 w-36 rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  );
}
