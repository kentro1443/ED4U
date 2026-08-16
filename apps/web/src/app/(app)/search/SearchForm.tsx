"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Icons } from "@/components/ui/icons";

export function SearchForm({ defaultValue }: { defaultValue: string }) {
  const router = useRouter();
  const [value, setValue] = useState(defaultValue);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    const q = value.trim();
    startTransition(() => router.push(q ? `/search?q=${encodeURIComponent(q)}` : "/search"));
  }

  return (
    <form onSubmit={submit} role="search" className="flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <label htmlFor="search-input" className="sr-only">
          Từ khóa tìm kiếm
        </label>
        <Icons.search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]"
          aria-hidden="true"
        />
        <input
          id="search-input"
          type="search"
          name="q"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoFocus
          placeholder="Mã phòng, tên lớp, câu lạc bộ, chủ đề…"
          className="h-11 w-full rounded-md border border-[var(--hairline)] bg-[var(--canvas)] pl-10 pr-3 text-sm text-[var(--ink)] placeholder:text-[var(--muted-soft)] transition-colors focus:border-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-gray-950/10"
        />
      </div>
      <Button type="submit" loading={pending} className="h-11 shrink-0 sm:w-32">
        Tìm
      </Button>
    </form>
  );
}
