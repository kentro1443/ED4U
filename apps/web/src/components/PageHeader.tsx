export function PageHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-6">
      <h1 className="wordmark text-3xl">{title}</h1>
      {description ? <p className="mt-1 text-sm text-[var(--muted)]">{description}</p> : null}
    </header>
  );
}

export function EmptyState({ title, action }: { title: string; action: string }) {
  return (
    <div
      role="status"
      className="rounded-xl border border-dashed border-[var(--line)] bg-[var(--card)] p-8"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{action}</p>
    </div>
  );
}
