"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/** A restrained top progress rail for client-side route changes. */
export function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const delayRef = useRef<number | null>(null);

  useEffect(() => {
    setVisible(false);
    if (delayRef.current) window.clearTimeout(delayRef.current);
  }, [pathname, searchParams]);

  useEffect(() => {
    function begin(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      const next = new URL(anchor.href, window.location.href);
      const current = new URL(window.location.href);
      if (
        next.origin !== current.origin ||
        (next.pathname === current.pathname && next.search === current.search)
      ) {
        return;
      }
      delayRef.current = window.setTimeout(() => setVisible(true), 100);
    }

    document.addEventListener("click", begin, true);
    return () => {
      document.removeEventListener("click", begin, true);
      if (delayRef.current) window.clearTimeout(delayRef.current);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[70] h-1 overflow-hidden transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <span className="block h-full w-1/3 animate-[route-progress_1.15s_ease-in-out_infinite] rounded-full bg-[var(--brand-600)] shadow-[0_0_16px_rgba(37,99,235,0.45)] motion-reduce:animate-pulse" />
    </div>
  );
}
