/* toast.tsx — A6 cross-cutting: system-level notifications.
   Error UX taxonomy: system errors → toast (here); form errors → inline;
   critical → full-screen (ErrorState fullScreen). */
"use client";

import React from "react";

type ToastKind = "success" | "error" | "info" | "warn";
interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  key?: string;
}

/** `durationMs` overrides the 4 s default; a repeated `key` replaces the
   visible toast with that key and restarts its timer. */
export interface ToastOpts {
  durationMs?: number;
  key?: string;
}

const DEFAULT_DURATION_MS = 4000;

interface ToastApi {
  toast: (message: string, kind?: ToastKind, opts?: ToastOpts) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
  warn: (m: string, opts?: ToastOpts) => void;
}

const ToastCtx = React.createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* Module-level bridge so non-React code (e.g. the React Query cache) can raise
   toasts without the hook. The mounted <ToastProvider> registers its pusher. */
type Pusher = (message: string, kind?: ToastKind, opts?: ToastOpts) => void;
let activePusher: Pusher | null = null;
export const notify = {
  toast: (m: string, k?: ToastKind) => activePusher?.(m, k),
  success: (m: string) => activePusher?.(m, "success"),
  error: (m: string) => activePusher?.(m, "error"),
  info: (m: string) => activePusher?.(m, "info"),
  warn: (m: string, opts?: ToastOpts) => activePusher?.(m, "warn", opts),
};

const COLORS: Record<ToastKind, { bg: string; border: string; icon: string }> = {
  success: { bg: "var(--ok-bg, #052e1c)", border: "var(--ok)", icon: "✓" },
  error: { bg: "var(--crit-bg, #2e0a0a)", border: "var(--crit)", icon: "✕" },
  info: { bg: "var(--bg-elevated)", border: "var(--border-strong)", icon: "ℹ" },
  warn: { bg: "var(--warn-bg)", border: "var(--warn)", icon: "⚠" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<Toast[]>([]);
  const seq = React.useRef(1);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = React.useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (message: string, kind: ToastKind = "info", opts?: ToastOpts) => {
      const id = seq.current++;
      const key = opts?.key;
      setItems((prev) => {
        const rest = key ? prev.filter((t) => t.key !== key) : prev;
        if (key) {
          for (const t of prev) {
            if (t.key !== key) continue;
            const old = timers.current.get(t.id);
            if (old) clearTimeout(old);
            timers.current.delete(t.id);
          }
        }
        return [...rest, { id, kind, message, key }];
      });
      // auto-dismiss (4s unless the caller asks for another duration)
      timers.current.set(id, setTimeout(() => dismiss(id), opts?.durationMs ?? DEFAULT_DURATION_MS));
    },
    [dismiss],
  );

  // Clear pending timers when the provider unmounts.
  React.useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const api = React.useMemo<ToastApi>(
    () => ({
      toast: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error"),
      info: (m) => push(m, "info"),
      warn: (m, opts) => push(m, "warn", opts),
    }),
    [push],
  );

  // Expose this provider's pusher to the module-level `notify` bridge.
  React.useEffect(() => {
    activePusher = push;
    return () => {
      if (activePusher === push) activePusher = null;
    };
  }, [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 20,
          right: 20,
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: 380,
        }}
        role="status"
        aria-live="polite"
      >
        {items.map((t) => {
          const c = COLORS[t.kind];
          return (
            <div
              key={t.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 16px",
                borderRadius: 9,
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: "var(--text-primary)",
                fontSize: 14,
                boxShadow: "0 6px 24px rgba(0,0,0,0.3)",
                animation: "ddToastIn .16s ease-out",
              }}
            >
              <span style={{ color: c.border, fontWeight: 700 }}>{c.icon}</span>
              <span style={{ flex: 1 }}>{t.message}</span>
              <button
                onClick={() => dismiss(t.id)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
