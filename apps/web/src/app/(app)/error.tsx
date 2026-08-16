"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icons } from "@/components/ui/icons";

/**
 * Route error boundary.
 *
 * Two things a user needs and previously did not get: something to *do*, and a
 * reference they can quote to IT. Next redacts server errors in production, so
 * `error.message` is either a generic string or — in development — an internal
 * detail; the digest is the stable identifier that ties this screen to the
 * server log, and it is shown rather than silently captured.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[boundary] route error", { digest: error.digest, error });
  }, [error]);

  return (
    <div className="mx-auto max-w-xl py-12">
      <Card className="space-y-5 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <Icons.alertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-lg font-semibold tracking-tight text-[var(--ink)]">
            Không tải được trang này
          </h1>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            Hệ thống gặp sự cố khi xử lý yêu cầu. Dữ liệu của bạn không bị thay đổi — thao tác đang
            dở dang đã được hoàn tác.
          </p>
        </div>

        {error.digest && (
          <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-soft)] p-3">
            <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Mã sự cố — cung cấp mã này khi báo cho ADMIN_IT
            </p>
            <p className="mt-1 font-mono text-sm font-semibold text-[var(--ink)]">{error.digest}</p>
          </div>
        )}

        <div className="flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md border border-[var(--hairline)] px-4 text-sm font-medium text-[var(--ink)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
          >
            Về trang tổng quan
          </Link>
          <Button onClick={() => reset()}>Thử lại</Button>
        </div>
      </Card>
    </div>
  );
}
