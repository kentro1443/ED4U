"use client";

import { useActionState } from "react";
import { acceptAppointmentAction } from "./actions";
import { Button } from "@/components/ui/Button";

export function AcceptAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState(acceptAppointmentAction, undefined);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="id" value={appointmentId} />
      <Button
        type="submit"
        variant="primary"
        size="sm"
        loading={pending}
        loadingLabel="Đang xử lý…"
      >
        Chấp nhận
      </Button>
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-xs text-red-600 font-medium">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
