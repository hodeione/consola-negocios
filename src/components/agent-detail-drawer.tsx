"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Table2, TrendingUp, X } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import { ActiveIdleChart, SimpleDailyChart, CHART_COLORS, fmtHMS } from "@/components/stats-charts";

interface DailyPoint {
  date: string;
  clockedMinutes: number;
  idleMinutes: number;
  activeMinutes: number;
  callsMade: number;
}
interface IdleGap {
  date: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
}
interface AgentDetail {
  daily: DailyPoint[];
  idleGaps: IdleGap[];
  totalClockedMinutes: number;
  totalIdleMinutes: number;
  totalActiveMinutes: number;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AgentDetailDrawer({
  userId,
  name,
  range,
  onClose,
}: {
  userId: string;
  name: string;
  range: { from: string; to: string };
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    // El drawer se monta de cero por cada agente (se abre/cierra por
    // completo, ver admin-stats-console.tsx), así que `loading` ya empieza
    // en `true` — no hace falta volver a ponerlo aquí dentro del efecto.
    let cancelled = false;
    queuedFetch(`/api/admin/stats/${userId}?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setDetail(data))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [userId, range.from, range.to]);

  const idlePct =
    detail && detail.totalClockedMinutes > 0 ? Math.round((detail.totalIdleMinutes / detail.totalClockedMinutes) * 100) : 0;

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-2xl flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/95 px-5 py-3.5 backdrop-blur-sm">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-100">{name}</h2>
            <p className="text-xs text-slate-500">
              {new Date(range.from).toLocaleDateString("es-ES")} — {new Date(range.to).toLocaleDateString("es-ES")}
            </p>
          </div>
          <button onClick={onClose} className="flex-shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-slate-900 hover:text-slate-200">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 p-5 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
            Cargando…
          </div>
        )}

        {detail && !loading && (
          <div className="flex flex-1 flex-col gap-5 p-5">
            {/* Resumen del rango */}
            <div className="grid grid-cols-3 gap-3">
              <div className="surface p-3 text-center">
                <div className="font-mono text-base font-semibold text-slate-100">{fmtHMS(detail.totalClockedMinutes)}</div>
                <div className="text-[10px] text-slate-500">Fichado</div>
              </div>
              <div className="surface p-3 text-center">
                <div className="font-mono text-base font-semibold" style={{ color: CHART_COLORS.active }}>
                  {fmtHMS(detail.totalActiveMinutes)}
                </div>
                <div className="text-[10px] text-slate-500">Con actividad</div>
              </div>
              <div className="surface p-3 text-center">
                <div className="font-mono text-base font-semibold" style={{ color: CHART_COLORS.idle }}>
                  {fmtHMS(detail.totalIdleMinutes)}
                </div>
                <div className="text-[10px] text-slate-500">Posible inactividad{idlePct > 0 ? ` (${idlePct}%)` : ""}</div>
              </div>
            </div>

            {!showTable ? (
              <>
                <section className="surface p-4">
                  <div className="mb-1 flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
                    <h3 className="text-sm font-semibold text-slate-100">Actividad por día</h3>
                  </div>
                  <p className="mb-3 text-xs text-slate-500">
                    Cada barra es el tiempo fichado ese día, partido entre tramos con actividad registrada (llamadas,
                    cambios de gestión) y huecos de {45}+ min sin ninguna.
                  </p>
                  <ActiveIdleChart daily={detail.daily} />
                </section>

                <section className="surface p-4">
                  <h3 className="mb-3 text-sm font-semibold text-slate-100">Llamadas por día</h3>
                  <SimpleDailyChart
                    daily={detail.daily.map((d) => ({ date: d.date, value: d.callsMade }))}
                    formatValue={(v) => `${v} llamada${v !== 1 ? "s" : ""}`}
                  />
                </section>
              </>
            ) : (
              <section className="surface overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-slate-900/60 text-left text-[10px] uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Día</th>
                        <th className="px-3 py-2">Fichado</th>
                        <th className="px-3 py-2">Activo</th>
                        <th className="px-3 py-2">Inactividad</th>
                        <th className="px-3 py-2">Llamadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.daily.map((d) => (
                        <tr key={d.date} className="border-t border-slate-800/70">
                          <td className="px-3 py-2 text-slate-300">{new Date(d.date + "T00:00:00").toLocaleDateString("es-ES")}</td>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-300">{fmtHMS(d.clockedMinutes)}</td>
                          <td className="px-3 py-2 font-mono tabular-nums" style={{ color: CHART_COLORS.active }}>
                            {fmtHMS(d.activeMinutes)}
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums" style={{ color: d.idleMinutes > 0 ? CHART_COLORS.idle : undefined }}>
                            {d.idleMinutes > 0 ? fmtHMS(d.idleMinutes) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono tabular-nums text-slate-300">{d.callsMade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <button
              onClick={() => setShowTable((v) => !v)}
              className="flex items-center justify-center gap-1.5 self-start rounded-md border border-slate-800 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
            >
              <Table2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              {showTable ? "Ver gráficas" : "Ver tabla"}
            </button>

            {/* Huecos de inactividad */}
            <section>
              <div className="mb-3 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-500" strokeWidth={2.25} />
                <h3 className="text-sm font-semibold text-slate-100">
                  Huecos sin actividad {detail.idleGaps.length > 0 && `(${detail.idleGaps.length})`}
                </h3>
              </div>
              {detail.idleGaps.length === 0 ? (
                <p className="text-xs text-slate-600">
                  Sin huecos de 45+ minutos sin llamadas ni cambios de gestión durante el tiempo fichado. 🎉
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.idleGaps.map((g, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs"
                    >
                      <span className="text-slate-300">
                        {fmtDateTime(g.startedAt)} → {fmtDateTime(g.endedAt)}
                      </span>
                      <span className="font-mono font-semibold text-amber-400">{fmtHMS(g.minutes)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
                No mide teclado ni ratón — solo cruza el tiempo fichado con la actividad que ya queda registrada en la
                consola. Un hueco marcado es una señal para revisar, no una prueba: puede haber trabajo real que no
                deja rastro aquí (una llamada larga, trabajo fuera de la consola…).
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
