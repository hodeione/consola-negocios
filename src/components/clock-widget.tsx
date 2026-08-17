"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, TimerOff, TimerReset } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";

interface TimeEntry {
  id: string;
  clockIn: string;
  clockOut: string | null;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/** Botón de fichar entrada/salida, visible para cualquier usuario logueado. */
export function ClockWidget() {
  const [entry, setEntry] = useState<TimeEntry | null | undefined>(undefined); // undefined = cargando
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    queuedFetch("/api/time-entries/current")
      .then((r) => r.json())
      .then((data) => setEntry(data.open))
      .catch(() => setEntry(null));
  }, []);

  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (!entry) return;
    const start = new Date(entry.clockIn).getTime();
    const tick = () => setElapsed(Date.now() - start);
    // Primer tick fuera del cuerpo síncrono del efecto (microtask) para no
    // pintar 00:00:00 durante el primer segundo si ya llevabas rato fichado.
    Promise.resolve().then(tick);
    tickRef.current = setInterval(tick, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [entry]);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const res = await queuedFetch(entry ? "/api/time-entries/clock-out" : "/api/time-entries/clock-in", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setEntry(entry ? null : data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (entry === undefined) {
    return (
      <div className="flex h-8 w-28 items-center justify-center rounded-md border border-slate-800/80 bg-slate-900/60">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-600" strokeWidth={2.5} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        title={entry ? "Fichar salida" : "Fichar entrada"}
        className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
          entry
            ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15"
            : "border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
        }`}
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
        ) : entry ? (
          <TimerOff className="h-3.5 w-3.5" strokeWidth={2.25} />
        ) : (
          <TimerReset className="h-3.5 w-3.5" strokeWidth={2.25} />
        )}
        {entry ? (
          <span className="font-mono tabular-nums">{formatElapsed(elapsed)}</span>
        ) : (
          "Fichar entrada"
        )}
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  );
}
