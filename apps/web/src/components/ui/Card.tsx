import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "soft" | "flat" | "interactive";
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", className, children, ...props },
  ref,
) {
  const variantStyles = {
    default: "bg-[var(--surface-card)] border border-[var(--hairline)] shadow-[var(--shadow-sm)]",
    soft: "bg-[var(--surface-soft)] border border-[var(--hairline-soft)]",
    flat: "bg-[var(--surface-card)] border-none",
    interactive:
      "bg-[var(--surface-card)] border border-[var(--hairline)] hover:-translate-y-0.5 hover:border-[var(--brand-100)] hover:shadow-[var(--shadow-md)] transition-[transform,border-color,box-shadow] duration-200 cursor-pointer motion-reduce:transform-none",
  }[variant];

  return (
    <div
      ref={ref}
      className={cn("rounded-2xl p-5 md:p-6 text-[var(--ink)]", variantStyles, className)}
      {...props}
    >
      {children}
    </div>
  );
});

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col space-y-1.5 pb-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-base font-extrabold tracking-[-0.02em] text-[var(--ink)]", className)}
      {...props}
    >
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-xs md:text-sm text-[var(--muted)]", className)} {...props}>
      {children}
    </p>
  );
}

export function CardContent({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center pt-4 border-t border-[var(--hairline-soft)]", className)}
      {...props}
    >
      {children}
    </div>
  );
}
