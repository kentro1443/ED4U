/**
 * URL-driven list state.
 *
 * Page, search text and facet filters live in the query string rather than in
 * client state, so a filtered view is bookmarkable, shareable and survives a
 * reload — which is how administrators actually work when they are handing a
 * case to a colleague. It also keeps every list a server component.
 */

export interface ListParams {
  page: number;
  perPage: number;
  q: string;
  filters: Readonly<Record<string, string>>;
}

export const DEFAULT_PER_PAGE = 25;
const MAX_PER_PAGE = 100;

export type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function parseListParams(
  searchParams: RawSearchParams,
  options: { facets?: readonly string[]; perPage?: number } = {},
): ListParams {
  const rawPage = Number.parseInt(firstValue(searchParams.page), 10);
  const rawPerPage = Number.parseInt(firstValue(searchParams.perPage), 10);

  const perPage =
    Number.isFinite(rawPerPage) && rawPerPage > 0
      ? Math.min(rawPerPage, MAX_PER_PAGE)
      : (options.perPage ?? DEFAULT_PER_PAGE);

  const filters: Record<string, string> = {};
  for (const facet of options.facets ?? []) {
    const value = firstValue(searchParams[facet]).trim();
    if (value && value !== "ALL") filters[facet] = value;
  }

  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    perPage,
    q: firstValue(searchParams.q).trim().slice(0, 120),
    filters,
  };
}

export function listSkip(params: ListParams): number {
  return (params.page - 1) * params.perPage;
}

/** Total pages for a result count, never less than one so the UI stays stable. */
export function pageCount(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** Builds a query string preserving current state with `changes` applied. */
export function buildQuery(
  current: RawSearchParams,
  changes: Record<string, string | number | undefined>,
): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(current)) {
    const single = firstValue(value);
    if (single) next.set(key, single);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === "" || value === "ALL") next.delete(key);
    else next.set(key, String(value));
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

/** Human range label: "1–25 trong 812". Empty results say so instead. */
export function rangeLabel(params: ListParams, shown: number, total: number): string {
  if (total === 0) return "0 kết quả";
  const from = listSkip(params) + 1;
  const to = listSkip(params) + shown;
  return `${from}–${to} trong ${total}`;
}
