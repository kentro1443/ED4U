"use client";

import { useActionState } from "react";
import { acceptAppointmentAction } from "./actions";

export function AcceptAppointmentButton({ appointmentId }: { appointmentId: string }) {
  const [state, action, pending] = useActionState(acceptAppointmentAction, undefined);
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="id" value={appointmentId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-[var(--pine)] px-3 py-1 text-sm text-white disabled:opacity-60"
      >
        {pending ? "Đang xử lý…" : "Chấp nhận"}
      </button>
      {state && !state.ok ? (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
