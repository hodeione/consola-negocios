"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";

interface ConversionRow {
  label: string;
  total: number;
  customers: number;
  conversionPct: number;
  revenue: number;
  avgDealValue: number;
}

/** Tasa de cierre por zona/tipo de negocio — para decidir dónde scrapear a
 * continuación según lo que de verdad convierte, no a ojo. */
export function ConversionInsights() {
  const [field, setField] = useState<"zone" | "keyword">("zone");
  // Se guarda junto al campo al que corresponde — así, mientras cambia de
  // "zona" a "tipo", se sabe que la respuesta en vuelo es para la anterior
  // selección y no hay que resetear a null de forma síncrona en el efecto.
  const [result, setResult] = useState<{ field: "zone" | "keyword"; rows: ConversionRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    queuedFetch(`/api/admin/insights?field=${field}`)
      .then((r) => r.json())
      .then((data) => !cancelled && setResult({ field, rows: data.rows }))
      .catch(() => !cancelled && setResult({ field, rows: [] }));
    return () => {
      cancelled = true;
    };
  }, [field]);

  const rows = result?.field === field ? result.rows : null;

  return (
    <section className="surface p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-slate-500" strokeWidth={2.25} />
          <h2 className="text-sm font-semibold text-slate-100">Tasa de cierre</h2>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
          {(["zone", "keyword"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setField(f)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                field === f ? "bg-blue-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              }`}
            >
              {f === "zone" ? "Por zona" : "Por tipo"}
            </button>
          ))}
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Histórico completo, sin límite de fecha. Solo se muestran segmentos con al menos 3 negocios (para no sacar
        conclusiones de una muestra de 1).
      </p>
      {rows === null ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
          Calculando…
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-600">Todavía no hay suficientes datos.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead className="text-left text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{field === "zone" ? "Zona" : "Tipo"}</th>
                <th className="px-3 py-2">Negocios</th>
                <th className="px-3 py-2">Clientes</th>
                <th className="px-3 py-2">Conversión</th>
                <th className="px-3 py-2">Ingresos</th>
                <th className="px-3 py-2">Ticket medio</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 15).map((r) => (
                <tr key={r.label} className="border-t border-slate-800/70">
                  <td className="px-3 py-2 text-slate-200">{r.label}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-slate-400">{r.total}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-slate-400">{r.customers}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        r.conversionPct >= 10 ? "text-emerald-400" : r.conversionPct > 0 ? "text-slate-300" : "text-slate-600"
                      }`}
                    >
                      {r.conversionPct}%
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-slate-400">
                    {r.revenue > 0 ? r.revenue.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—"}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-slate-400">
                    {r.avgDealValue > 0 ? r.avgDealValue.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
