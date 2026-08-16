import Link from "next/link";
import { cn } from "@/lib/cn";
import {
  buildQuery,
  pageCount,
  rangeLabel,
  type ListParams,
  type RawSearchParams,
} from "@/lib/listParams";
import { Icons } from "./icons";
import { FacetSelect, SearchField } from "./SearchField";

/**
 * The controls every operational list needs: find a record, narrow by state,
 * and page through the rest. State lives in the URL, so the list itself stays a
 * server component and every view is addressable.
 */

export interface Facet {
  /** Query-string key. */
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
}

export function ListToolbar({
  basePath,
  searchParams,
  params,
  facets = [],
  searchPlaceholder = "Tìm kiếm…",
  total,
  shown,
  actions,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  params: ListParams;
  facets?: readonly Facet[];
  searchPlaceholder?: string;
  total: number;
  shown: number;
  actions?: React.ReactNode;
}) {
  const hasQuery = params.q.length > 0 || Object.keys(params.filters).length > 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <SearchField
            basePath={basePath}
            searchParams={searchParams}
            defaultValue={params.q}
            placeholder={searchPlaceholder}
          />
          {facets.map((facet) => (
            <FacetSelect
              key={facet.name}
              name={facet.name}
              label={facet.label}
              options={facet.options}
              value={params.filters[facet.name] ?? "ALL"}
              basePath={basePath}
              searchParams={searchParams}
            />
          ))}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
        <p aria-live="polite">
          <span className="font-medium tabular-nums text-[var(--body)]">
            {rangeLabel(params, shown, total)}
          </span>
          {hasQuery && " · đang lọc"}
        </p>
        {hasQuery && (
          <Link
            href={basePath}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[var(--body)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            <Icons.close className="h-3 w-3" aria-hidden="true" />
            Xóa bộ lọc
          </Link>
        )}
      </div>
    </div>
  );
}

export function Pagination({
  basePath,
  searchParams,
  params,
  total,
  className,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  params: ListParams;
  total: number;
  className?: string;
}) {
  const pages = pageCount(total, params.perPage);
  if (pages <= 1) return null;

  const hasPrev = params.page > 1;
  const hasNext = params.page < pages;

  const linkClass =
    "inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--hairline)] px-3 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]";
  const disabledClass =
    "inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--hairline-soft)] px-3 text-sm font-medium text-[var(--muted)] opacity-60";

  return (
    <nav
      aria-label="Phân trang"
      className={cn("flex items-center justify-between gap-3 pt-1", className)}
    >
      {hasPrev ? (
        <Link
          href={`${basePath}${buildQuery(searchParams, { page: params.page - 1 })}`}
          className={linkClass}
          rel="prev"
        >
          <Icons.chevronLeft className="h-4 w-4" aria-hidden="true" />
          Trang trước
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          <Icons.chevronLeft className="h-4 w-4" aria-hidden="true" />
          Trang trước
        </span>
      )}

      <p className="text-xs tabular-nums text-[var(--muted)]">
        Trang <span className="font-semibold text-[var(--ink)]">{params.page}</span> / {pages}
      </p>

      {hasNext ? (
        <Link
          href={`${basePath}${buildQuery(searchParams, { page: params.page + 1 })}`}
          className={linkClass}
          rel="next"
        >
          Trang sau
          <Icons.chevronRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <span className={disabledClass} aria-disabled="true">
          Trang sau
          <Icons.chevronRight className="h-4 w-4" aria-hidden="true" />
        </span>
      )}
    </nav>
  );
}
