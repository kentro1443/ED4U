"use client";

import { useState } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Icons } from "@/components/ui/icons";

export interface AuditRowData {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId: string;
  timestampIso: string;
  timestampLocal: string;
  actorLabel: string;
  actorCode: string | null;
  beforeJson: string | null;
  afterJson: string | null;
}

/**
 * One audit record. The recorded before/after state is the part that makes a
 * log defensible rather than merely present, so it is available on every row —
 * collapsed by default so the list stays scannable, expanded in place so the
 * reader never loses their position in the timeline.
 */
export function AuditRow({ event }: { event: AuditRowData }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(event.beforeJson || event.afterJson);

  return (
    <li className="transition-colors hover:bg-[var(--surface-soft)]/60">
      <div className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
        <time
          dateTime={event.timestampIso}
          title={`UTC: ${event.timestampIso}`}
          className="shrink-0 font-mono text-xs tabular-nums text-[var(--muted)] sm:w-44"
        >
          {event.timestampLocal}
        </time>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={actionTone(event.action)} size="sm">
              {event.action}
            </Badge>
            <span className="text-sm font-medium text-[var(--ink)]">{event.entityType}</span>
            <span className="font-mono text-[11px] text-[var(--muted)]">
              {event.entityId.slice(0, 8)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-[var(--muted)]">
            <span className="text-[var(--body)]">{event.actorLabel}</span>
            {event.actorCode && <span className="font-mono"> · {event.actorCode}</span>}
          </p>
        </div>

        {hasDetail ? (
          <button
            type="button"
            onClick={() => setOpen((current) => !current)}
            aria-expanded={open}
            aria-controls={`audit-detail-${event.id}`}
            className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-[var(--body)] transition-colors hover:bg-[var(--surface-card)] hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            {open ? "Ẩn thay đổi" : "Xem thay đổi"}
            <Icons.chevronDown
              className={`h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none ${
                open ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>
        ) : (
          <span className="shrink-0 px-2.5 text-xs text-[var(--muted)]">Không có ảnh chụp</span>
        )}
      </div>

      {open && hasDetail && (
        <div
          id={`audit-detail-${event.id}`}
          className="grid gap-3 border-t border-[var(--hairline-soft)] bg-[var(--surface-soft)] px-4 py-3 md:grid-cols-2"
        >
          <StatePanel
            title="Trước"
            json={event.beforeJson}
            emptyLabel="Không có trạng thái trước"
          />
          <StatePanel title="Sau" json={event.afterJson} emptyLabel="Không có trạng thái sau" />
          <p className="font-mono text-[11px] text-[var(--muted)] md:col-span-2">
            requestId: {event.requestId} · entityId: {event.entityId}
          </p>
        </div>
      )}
    </li>
  );
}

function StatePanel({
  title,
  json,
  emptyLabel,
}: {
  title: string;
  json: string | null;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        {title}
      </p>
      {json ? (
        <pre className="overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--canvas)] p-3 font-mono text-[11px] leading-relaxed text-[var(--body)]">
          {json}
        </pre>
      ) : (
        <p className="rounded-lg border border-dashed border-[var(--hairline)] p-3 text-xs text-[var(--muted)]">
          {emptyLabel}
        </p>
      )}
    </div>
  );
}

/** Colour carries the shape of the change, so destructive edits stand out. */
function actionTone(action: string): BadgeTone {
  if (action.includes("DELETE") || action.includes("REJECT") || action.includes("CANCEL")) {
    return "danger";
  }
  if (action.includes("APPROVE") || action.includes("CREATE")) return "success";
  if (action.includes("UPDATE") || action.includes("REVIEW")) return "warning";
  return "neutral";
}
