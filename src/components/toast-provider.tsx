"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

type ShowToast = (message: string, tone?: "success" | "error") => void;

const ToastContext = createContext<ShowToast | null>(null);

/** Confirmación breve tras una acción — "Guardado", "Error al guardar"...
 * Antes de esto, guardar con éxito no daba ninguna señal visible (solo se
 * veía si algo fallaba), lo que generaba la duda de "¿esto se ha guardado
 * de verdad?" — ver la revisión de experiencia del 18 ago 2026. */
export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() tiene que usarse dentro de <ToastProvider>");
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback<ShowToast>((message, tone = "success") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex flex-col-reverse gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast-in flex items-center gap-2 rounded-lg border px-3.5 py-2.5 text-sm font-medium shadow-lg backdrop-blur-sm ${
              t.tone === "success"
                ? "border-emerald-500/25 bg-emerald-950/90 text-emerald-200"
                : "border-red-500/25 bg-red-950/90 text-red-200"
            }`}
          >
            {t.tone === "success" ? (
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={2.25} />
            ) : (
              <XCircle className="h-4 w-4 flex-shrink-0" strokeWidth={2.25} />
            )}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
