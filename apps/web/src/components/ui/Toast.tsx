"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { ToastRegion, type ToastMessage } from "./Overlays";

/**
 * Application-wide confirmation feedback.
 *
 * Every mutation in ED4U previously completed in silence — the page simply
 * re-rendered — which leaves a user unsure whether an approval, a submission or
 * a deletion actually happened. That ambiguity is worst on exactly the actions
 * that matter most, so confirming a mutation is treated as part of performing
 * it.
 */

type Tone = ToastMessage["tone"];

interface ToastApi {
  show: (text: string, tone?: Tone) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
  warning: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DISMISS_AFTER_MS = 5000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setMessages((current) => current.filter((m) => m.id !== id));
  }, []);

  const show = useCallback(
    (text: string, tone: Tone = "info") => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      // Cap the stack so a burst of results cannot cover the page it describes.
      setMessages((current) => [...current.slice(-2), { id, tone, text }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DISMISS_AFTER_MS),
      );
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (text: string) => show(text, "success"),
      error: (text: string) => show(text, "danger"),
      info: (text: string) => show(text, "info"),
      warning: (text: string) => show(text, "warning"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastRegion messages={messages} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast phải được dùng bên trong <ToastProvider>.");
  }
  return ctx;
}
