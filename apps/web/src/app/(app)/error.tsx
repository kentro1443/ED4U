"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/ui/Feedback";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App boundary error caught:", error);
  }, [error]);

  return (
    <div className="py-12">
      <ErrorState
        title="Đã xảy ra lỗi không mong muốn"
        description={
          error.message || "Hệ thống gặp sự cố khi xử lý trang này. Bạn có thể thử tải lại."
        }
        action={
          <Button variant="secondary" onClick={() => reset()}>
            Thử lại
          </Button>
        }
      />
    </div>
  );
}
