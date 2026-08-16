"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { buildQuery, type RawSearchParams } from "@/lib/listParams";
import { Icons } from "./icons";

/**
 * List search and facet controls.
 *
 * Both write their state into the URL, so the surrounding list stays a server
 * component and every filtered view is a real address the user can bookmark or
 * send to a colleague.
 */

export function SearchField({
  basePath,
  searchParams,
  defaultValue,
  placeholder,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  defaultValue: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    // Any new search starts at page one; keeping the old page number would show
    // an empty page for a narrower result set.
    const href = `${basePath}${buildQuery(searchParams, { q: value.trim(), page: undefined })}`;
    startTransition(() => router.push(href));
  }

  return (
    <form onSubmit={submit} role="search" className="relative flex-1 sm:max-w-xs">
      <label htmlFor="list-search" className="sr-only">
        {placeholder}
      </label>
      <Icons.search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden="true"
      />
      <input
        id="list-search"
        type="search"
        name="q"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-[var(--hairline)] bg-[var(--canvas)] pl-9 pr-9 text-sm text-[var(--ink)] placeholder:text-[var(--muted)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
      />
      {pending && (
        <Icons.spinner
          className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--muted)] motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      <button type="submit" className="sr-only">
        Tìm
      </button>
    </form>
  );
}

export function FacetSelect({
  name,
  label,
  options,
  value,
  basePath,
  searchParams,
}: {
  name: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  value: string;
  basePath: string;
  searchParams: RawSearchParams;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="relative">
      <label htmlFor={`facet-${name}`} className="sr-only">
        {label}
      </label>
      <select
        id={`facet-${name}`}
        value={value}
        disabled={pending}
        onChange={(event) => {
          const href = `${basePath}${buildQuery(searchParams, {
            [name]: event.target.value,
            page: undefined,
          })}`;
          startTransition(() => router.push(href));
        }}
        className="h-9 w-full cursor-pointer appearance-none rounded-md border border-[var(--hairline)] bg-[var(--canvas)] py-0 pl-3 pr-8 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)] sm:w-48"
      >
        <option value="ALL">{label}: tất cả</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {label}: {option.label}
          </option>
        ))}
      </select>
      <Icons.chevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
        aria-hidden="true"
      />
    </div>
  );
}
