import Link from "next/link";
import type { Actor } from "@ed4u/domain";
import { visibleNav } from "@/lib/nav";

export function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const groups = visibleNav(actor);
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 border-r border-[var(--line)] bg-[var(--card)] px-4 py-6 md:block">
        <Link href="/dashboard" className="wordmark text-2xl text-[var(--pine)]">
          ED4U
        </Link>
        <p className="mt-1 text-xs text-[var(--muted)]">{actor.schoolMemberCode}</p>
        <nav className="mt-8 space-y-6" aria-label="Chính">
          {groups.map((g) => (
            <div key={g.id}>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--muted)]">
                {g.label}
              </p>
              <ul className="mt-2 space-y-1">
                {g.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="block rounded-md px-2 py-1.5 text-sm hover:bg-[var(--paper)]"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 md:px-8">
          <Link href="/dashboard" className="wordmark text-xl text-[var(--pine)] md:hidden">
            ED4U
          </Link>
          <p className="text-sm text-[var(--muted)]">
            {actor.roles.join(" · ")} · {actor.membershipStatus}
          </p>
        </header>
        <div className="flex-1 px-4 py-6 md:px-8">{children}</div>
      </div>
    </div>
  );
}
