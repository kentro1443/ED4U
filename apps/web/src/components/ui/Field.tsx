import {
  cloneElement,
  forwardRef,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export const inputBaseClass =
  "w-full rounded-xl border border-[var(--hairline)] bg-[var(--surface-card)] px-3.5 py-2 text-sm text-[var(--ink)] shadow-[inset_0_1px_0_rgba(15,23,42,0.02)] " +
  "placeholder:text-[var(--muted-soft)] transition-[border-color,box-shadow,background-color] duration-200 " +
  "hover:border-[var(--brand-100)] focus:border-[var(--brand-600)] focus:outline-none focus:ring-4 focus:ring-blue-500/10 " +
  "disabled:cursor-not-allowed disabled:bg-[var(--surface-soft)] disabled:text-[var(--muted)] " +
  "aria-[invalid=true]:border-[var(--error)] aria-[invalid=true]:focus:ring-red-500/20";

export function Label({
  htmlFor,
  children,
  required,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        "block text-xs font-semibold tracking-tight text-[var(--ink)] select-none",
        className,
      )}
    >
      {children}
      {required && (
        <span className="ml-1 text-[var(--error)]" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

type DescribedControlProps = {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  required?: boolean;
};

export function Field({
  id,
  label,
  description,
  error,
  required,
  children,
  className,
}: {
  id: string;
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactElement<DescribedControlProps>;
  className?: string;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required: required || children.props.required,
      })
    : children;

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={id} required={required}>
          {label}
          {required && <span className="sr-only"> (bắt buộc)</span>}
        </Label>
      )}
      {control}
      {description && (
        <p id={descriptionId} className="text-xs text-[var(--muted)] leading-relaxed">
          {description}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="text-xs font-medium text-[var(--error)] leading-relaxed"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, type = "text", ...props }, ref) {
    return (
      <input ref={ref} type={type} className={cn(inputBaseClass, "h-10", className)} {...props} />
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, rows = 3, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(inputBaseClass, "min-h-24 resize-y py-2.5", className)}
      {...props}
    />
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(inputBaseClass, "h-10 bg-no-repeat pr-9 cursor-pointer", className)}
        {...props}
      >
        {children}
      </select>
    );
  },
);

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, className, id, ...props },
  ref,
) {
  const inputId = id ?? props.name;
  return (
    <label className={cn("flex items-start gap-3 text-sm cursor-pointer select-none", className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-[var(--hairline)] accent-[var(--primary)] focus:ring-2 focus:ring-gray-950/20"
        {...props}
      />
      <span>
        <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span>
        )}
      </span>
    </label>
  );
});

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, ...props },
  ref,
) {
  return (
    <label
      className={cn(
        "flex items-center gap-2.5 text-sm font-medium text-[var(--ink)] cursor-pointer select-none",
        className,
      )}
    >
      <input
        ref={ref}
        type="radio"
        className="h-4 w-4 border-[var(--hairline)] accent-[var(--primary)] focus:ring-2 focus:ring-gray-950/20"
        {...props}
      />
      {label}
    </label>
  );
});

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  description?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, ...props },
  ref,
) {
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 cursor-pointer select-none",
        className,
      )}
    >
      <span>
        <span className="block text-sm font-medium text-[var(--ink)]">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span>
        )}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0">
        <input ref={ref} type="checkbox" role="switch" className="peer sr-only" {...props} />
        <span className="absolute inset-0 rounded-full bg-gray-200 transition-colors peer-checked:bg-[var(--primary)] peer-focus-visible:ring-2 peer-focus-visible:ring-gray-950/20" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-xs transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
});
