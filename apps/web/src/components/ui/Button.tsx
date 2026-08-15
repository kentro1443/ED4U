import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Icons } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const baseStyles =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium text-sm transition-colors duration-150 " +
  "disabled:opacity-50 disabled:pointer-events-none cursor-pointer " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] select-none";

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--primary)] text-[var(--on-primary)] hover:bg-[var(--primary-hover)] active:bg-[var(--primary-active)] shadow-sm",
  secondary:
    "bg-[var(--canvas)] text-[var(--ink)] border border-[var(--hairline)] hover:bg-[var(--surface-soft)] active:bg-[var(--surface-card)] shadow-xs",
  outline:
    "bg-transparent text-[var(--body)] border border-[var(--hairline)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
  ghost: "bg-transparent text-[var(--body)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
  danger: "bg-[var(--error)] text-white hover:bg-red-600 active:bg-red-700 shadow-sm",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    className,
    loading = false,
    loadingLabel,
    disabled,
    children,
    type = "button",
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <Icons.spinner
            className="h-4 w-4 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          <span>{loadingLabel ?? children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  label: string;
  children: React.ReactNode;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, variant = "ghost", size = "md", className, ...props },
  ref,
) {
  const iconSizeClass = {
    sm: "h-8 w-8 p-0",
    md: "h-10 w-10 p-0",
    lg: "h-12 w-12 p-0",
  }[size];

  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cn("aspect-square shrink-0", iconSizeClass, className)}
      {...props}
    >
      {children}
    </Button>
  );
});

export interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  target?: string;
  rel?: string;
  children: React.ReactNode;
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
