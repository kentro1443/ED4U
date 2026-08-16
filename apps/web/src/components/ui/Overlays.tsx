"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icons } from "./icons";

// ==========================================
// DIALOG (MODAL)
// ==========================================
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  trigger,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  trigger?: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 grid max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-5 overflow-y-auto rounded-[28px] border border-[var(--hairline)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-lg)] duration-200",
            "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <DialogPrimitive.Title className="text-lg font-semibold tracking-tight text-[var(--ink)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-[var(--muted)]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="rounded-xl p-2 text-[var(--muted)] transition-colors hover:bg-[var(--brand-50)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-600)]">
              <Icons.close className="h-4 w-4" />
              <span className="sr-only">Đóng</span>
            </DialogPrimitive.Close>
          </div>
          <div>{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ==========================================
// DRAWER / SHEET
// ==========================================
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  side = "right",
  trigger,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  side?: "left" | "right";
  trigger?: ReactNode;
  className?: string;
}) {
  const sideClass =
    side === "left"
      ? "left-3 data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
      : "right-3 data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger>}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-3 z-50 flex h-auto w-[min(28rem,calc(100vw-1.5rem))] flex-col gap-4 rounded-[28px] border border-[var(--hairline)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-lg)] transition-[transform,opacity] ease-[var(--ease-drawer)] data-[state=open]:duration-300 data-[state=closed]:duration-200",
            sideClass,
            className,
          )}
        >
          <div className="flex items-center justify-between border-b border-[var(--hairline)] pb-4">
            <div>
              <DialogPrimitive.Title className="text-base font-semibold text-[var(--ink)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-xs text-[var(--muted)]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className="rounded-xl p-2 text-[var(--muted)] transition-colors hover:bg-[var(--brand-50)] hover:text-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-600)]">
              <Icons.close className="h-4 w-4" />
              <span className="sr-only">Đóng</span>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ==========================================
// DROPDOWN MENU
// ==========================================
export interface DropdownMenuItem {
  label: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
  disabled?: boolean;
}

export function DropdownMenu({
  trigger,
  items,
  align = "end",
}: {
  trigger: ReactNode;
  items: DropdownMenuItem[];
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          className="z-50 min-w-48 overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--surface-card)] p-1.5 text-[var(--ink)] shadow-[var(--shadow-lg)] animate-in fade-in-80"
        >
          {items.map((item, idx) => (
            <DropdownMenuPrimitive.Item
              key={idx}
              disabled={item.disabled}
              onSelect={item.onClick}
              className={cn(
                "relative flex cursor-pointer select-none items-center gap-2 rounded-xl px-3 py-2.5 text-sm outline-none transition-colors",
                "focus:bg-[var(--brand-50)] focus:text-[var(--primary)]",
                item.danger && "text-red-600 focus:bg-red-50 focus:text-red-700",
                item.disabled && "pointer-events-none opacity-50",
              )}
            >
              {item.icon}
              <span>{item.label}</span>
            </DropdownMenuPrimitive.Item>
          ))}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

// ==========================================
// TOOLTIP
// ==========================================
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            className="z-50 overflow-hidden rounded-xl bg-[var(--surface-dark)] px-3 py-1.5 text-xs font-medium text-white shadow-[var(--shadow-md)] animate-in fade-in-0 zoom-in-95"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-[var(--surface-dark)]" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

// ==========================================
// TOAST REGION
// ==========================================
export interface ToastMessage {
  id: string;
  tone: "success" | "danger" | "info" | "warning";
  text: string;
}

export function ToastRegion({
  messages,
  onDismiss,
}: {
  messages: ReadonlyArray<ToastMessage>;
  onDismiss?: (id: string) => void;
}) {
  if (!messages.length) return null;

  const toneClass = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    danger: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  };

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100%-2rem))] flex-col gap-2 pointer-events-none"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            "pointer-events-auto flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-[var(--shadow-md)] transition-[opacity,transform]",
            toneClass[m.tone],
          )}
        >
          <span>{m.text}</span>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(m.id)}
              className="rounded-xl p-1.5 opacity-70 transition-[background-color,opacity] hover:bg-black/5 hover:opacity-100"
              aria-label="Đóng thông báo"
            >
              <Icons.close className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
