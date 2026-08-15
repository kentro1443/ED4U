import {
  forwardRef,
  type HTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

export const Table = forwardRef<HTMLTableElement, HTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <div className="relative w-full overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] shadow-xs">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-left text-sm", className)}
        {...props}
      />
    </div>
  );
});

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      className={cn(
        "border-b border-[var(--hairline)] bg-[var(--surface-soft)] text-xs font-semibold uppercase tracking-wider text-[var(--muted)]",
        className,
      )}
      {...props}
    />
  );
});

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(function TableBody({ className, ...props }, ref) {
  return (
    <tbody
      ref={ref}
      className={cn("divide-y divide-[var(--hairline-soft)] bg-[var(--canvas)]", className)}
      {...props}
    />
  );
});

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  function TableRow({ className, ...props }, ref) {
    return (
      <tr
        ref={ref}
        className={cn(
          "transition-colors hover:bg-[var(--surface-soft)]/80 data-[state=selected]:bg-[var(--surface-soft)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, ...props }, ref) {
    return (
      <th
        ref={ref}
        className={cn(
          "h-10 px-4 text-left align-middle font-semibold text-[var(--muted)] select-none",
          className,
        )}
        {...props}
      />
    );
  },
);

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return (
      <td ref={ref} className={cn("p-4 align-middle text-[var(--ink)]", className)} {...props} />
    );
  },
);

export interface ColumnDef<T> {
  key: string;
  header: string;
  className?: string;
  render: (item: T) => React.ReactNode;
}

export function DataTable<T extends { id: string | number }>({
  data,
  columns,
  emptyMessage = "Không có dữ liệu.",
  className,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <Table className={className}>
      <TableHeader>
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.key} className={col.className}>
              {col.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={columns.length} className="h-24 text-center text-[var(--muted)]">
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          data.map((item) => (
            <TableRow key={item.id}>
              {columns.map((col) => (
                <TableCell key={col.key} className={col.className}>
                  {col.render(item)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
