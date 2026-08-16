"use client";

import { useState, type ReactNode } from "react";
import { Button, type ButtonVariant, type ButtonSize } from "./Button";
import { Dialog } from "./Overlays";

/**
 * Confirmation for consequential actions.
 *
 * `window.confirm` cannot show *what* is about to change, cannot be styled to
 * distinguish a reversible action from an irreversible one, and cannot be
 * keyboard-tested. Actions that commit a transaction — locking a room, deleting
 * an event, cancelling a booking — state their consequence and list the exact
 * facts being committed before the user agrees.
 */

export interface ConfirmDetail {
  label: string;
  value: ReactNode;
}

export function ConfirmButton({
  onConfirm,
  title,
  consequence,
  details,
  confirmLabel,
  cancelLabel = "Quay lại",
  variant = "primary",
  confirmVariant,
  size = "md",
  disabled,
  loading,
  className,
  children,
}: {
  onConfirm: () => void;
  /** What the user is about to do, as a question they can answer. */
  title: string;
  /** Why it deserves a pause — say plainly whether it can be undone. */
  consequence: string;
  /** The exact values being committed, so the user checks rather than trusts. */
  details?: ConfirmDetail[];
  confirmLabel: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={consequence}
      trigger={
        <Button variant={variant} size={size} disabled={disabled} className={className}>
          {children}
        </Button>
      }
    >
      <div className="space-y-5">
        {details && details.length > 0 && (
          <dl className="divide-y divide-[var(--hairline-soft)] rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] px-4">
            {details.map((detail) => (
              <div
                key={detail.label}
                className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <dt className="text-xs font-medium text-[var(--muted)]">{detail.label}</dt>
                <dd className="text-sm text-[var(--ink)] sm:text-right">{detail.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={() => setOpen(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={confirmVariant ?? variant}
            loading={loading}
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
