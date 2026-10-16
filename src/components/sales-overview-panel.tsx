"use client";

import { useEffect, useState } from "react";
import { AlarmClock, Banknote, Clock, Filter, Loader2, PackageCheck, Shuffle, Store } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import { PRODUCT_LABEL } from "@/lib/businesses/labels";
import type { SalesOverview } from "@/lib/sales-overview";

const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Bloque de ventas de /admin/stats: dinero, embudo, agentes, horas, sectores,
 * productos y reparto diario — todo para el rango elegido arriba.
 */
export function SalesOverviewPanel({ range }: { range: { from: string; to: string } }) {
  const [data, setData] = useState<{ key: string; overview: SalesOverview } | null>(null);
  const key = `${range.from}|${range.to}`;

  useEffect(() => {
    let cancelled = false;
    queuedFetch(`/api/admin/sales-overview?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`)
      .then((r) => r.json())
      .then((overview) => !cancelled && setData({ key, overview }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, range.from, range.to]);

  const o = data?.key === key ? data.overview : null;
  if (!o) {
    return (
      <section className="surface flex items-center gap-2 p-5 text-xs text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
        Calculando ventas…
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ── Dinero ───────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Facturado" value={eur(o.money.invoiced)} hint={`${o.money.deals} venta${o.money.deals === 1 ? "" : "s"} cerrada${o.money.deals === 1 ? "" : "s"}`} accent />
        <Kpi label="Cobrado" value={eur(o.money.collected)} hint="pagos recibidos en el rango" />
        <Kpi
          label="Pendiente de cobro"
          value={eur(o.money.pendingCollection)}
          hint={`${o.money.pendingCount} cliente${o.money.pendingCount === 1 ? "" : "s"} sin pagar (total)`}
          warn={o.money.pendingCount > 0}
        />
        <Kpi label="Ticket medio" value={o.money.deals ? eur(o.money.avgTicket) : "—"} hint="por venta cerrada" />
        <Kpi label="Seguimientos vencidos" value={String(o.totals.overdueFollowUps)} hint="llamadas que se pasaron de fecha" warn={o.totals.overdueFollowUps > 0} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ── Embudo del equipo ───────────────────── */}
        <Panel icon={<Filter className="h-4 w-4" strokeWidth={2.25} />} title="Embudo del equipo" subtitle="Negocios distintos en el rango">
          <Funnel row={o.totals} />
        </Panel>

        {/* ── Horas ───────────────────────────────── */}
        <Panel icon={<Clock className="h-4 w-4" strokeWidth={2.25} />} title="Llamadas por hora" subtitle={bestHourText(o.byHour)}>
          <HourBars rows={o.byHour} />
        </Panel>
      </div>

      {/* ── Por agente ──────────────────────────── */}
      <Panel icon={<AlarmClock className="h-4 w-4" strokeWidth={2.25} />} title="Embudo por agente" subtitle="Quién convierte, no solo quién llama más">
        {o.agents.length === 0 ? (
          <Empty>Sin llamadas en este rango.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Agente</th>
                  <Th>Llamados</Th>
                  <Th>Contactados</Th>
                  <Th>Interesados</Th>
                  <Th>Clientes</Th>
                  <Th>Conversión</Th>
                  <Th>Facturado</Th>
                  <Th>Vencidos</Th>
                </tr>
              </thead>
              <tbody>
                {o.agents.map((a) => (
                  <tr key={a.id} className="border-b border-slate-900 text-slate-300">
                    <td className="py-2 pr-3 font-medium text-slate-100">{a.name}</td>
                    <Td>{a.called}</Td>
                    <Td>
                      {a.contacted} <Muted>{pct(a.contacted, a.called)}%</Muted>
                    </Td>
                    <Td>
                      {a.interested} <Muted>{pct(a.interested, a.called)}%</Muted>
                    </Td>
                    <Td>{a.customers}</Td>
                    <Td>
                      <ConversionMeter value={pct(a.customers, a.called)} />
                    </Td>
                    <Td>{a.revenue ? eur(a.revenue) : "—"}</Td>
                    <Td>{a.overdueFollowUps > 0 ? <span className="font-semibold text-amber-300">{a.overdueFollowUps}</span> : <Muted>0</Muted>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ── Por sector ──────────────────────────── */}
        <Panel icon={<Store className="h-4 w-4" strokeWidth={2.25} />} title="Qué sector responde mejor" subtitle="% de negocios llamados que acaban interesados o clientes">
          {o.bySector.length === 0 ? (
            <Empty>Sin llamadas en este rango.</Empty>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Sector</th>
                  <Th>Llamados</Th>
                  <Th>Interesados</Th>
                  <Th>Clientes</Th>
                  <Th>Respuesta</Th>
                </tr>
              </thead>
              <tbody>
                {o.bySector.map((s) => (
                  <tr key={s.sector} className="border-b border-slate-900 text-slate-300">
                    <td className="py-2 pr-3 text-slate-100">{s.label}</td>
                    <Td>{s.called}</Td>
                    <Td>{s.interested}</Td>
                    <Td>{s.customers}</Td>
                    <Td>
                      <ConversionMeter value={s.conversionPct} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <div className="flex flex-col gap-4">
          {/* ── Por producto ──────────────────────── */}
          <Panel icon={<PackageCheck className="h-4 w-4" strokeWidth={2.25} />} title="Ventas por producto">
            {o.byProduct.length === 0 ? (
              <Empty>Ninguna venta cerrada en este rango.</Empty>
            ) : (
              <ul className="space-y-2">
                {o.byProduct.map((p) => (
                  <li key={p.product} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-100">{p.product === "SIN_PRODUCTO" ? "Sin producto apuntado" : PRODUCT_LABEL[p.product] ?? p.product}</span>
                    <span className="flex items-center gap-3 tabular-nums">
                      <Muted>{p.deals} venta{p.deals === 1 ? "" : "s"}</Muted>
                      <span className="font-semibold text-slate-200">{eur(p.revenue)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* ── Reparto diario ────────────────────── */}
          <Panel icon={<Shuffle className="h-4 w-4" strokeWidth={2.25} />} title="Reparto diario automático" subtitle="Negocios asignados solos en este rango y qué ha pasado con ellos">
            <div className="grid grid-cols-4 gap-2 text-center">
              <MiniStat label="Asignados" value={o.autoAssign.assigned} />
              <MiniStat label="Ya llamados" value={o.autoAssign.called} of={o.autoAssign.assigned} />
              <MiniStat label="Interesados" value={o.autoAssign.interested} of={o.autoAssign.assigned} />
              <MiniStat label="Clientes" value={o.autoAssign.customers} of={o.autoAssign.assigned} />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function bestHourText(rows: SalesOverview["byHour"]): string {
  const candidates = rows.filter((r) => r.calls >= 5);
  if (candidates.length === 0) return "Pocas llamadas aún para sacar conclusiones";
  const best = candidates.reduce((a, b) => (b.contacted / b.calls > a.contacted / a.calls ? b : a));
  return `Mejor hora para pillarles: ${best.hour}:00 (${pct(best.contacted, best.calls)}% contestan y hablan)`;
}

function Funnel({ row }: { row: SalesOverview["totals"] }) {
  const steps = [
    { label: "Llamados", value: row.called },
    { label: "Contactados", value: row.contacted },
    { label: "Interesados", value: row.interested },
    { label: "Clientes", value: row.customers },
  ];
  const max = Math.max(1, row.called);
  return (
    <div className="space-y-2.5">
      {steps.map((s, i) => (
        <div key={s.label} className="grid grid-cols-[92px_1fr_88px] items-center gap-3 text-xs">
          <span className="text-slate-400">{s.label}</span>
          <div className="h-5 rounded bg-slate-900/80">
            <div className="h-full rounded bg-blue-500/80" style={{ width: `${Math.max(s.value > 0 ? 2 : 0, (s.value / max) * 100)}%` }} />
          </div>
          <span className="text-right tabular-nums">
            <span className="font-semibold text-slate-100">{s.value}</span>
            {i > 0 && <span className="ml-1.5 text-slate-500">{pct(s.value, steps[i - 1].value)}%</span>}
          </span>
        </div>
      ))}
      <p className="pt-1 text-[11px] text-slate-500">El % es sobre el paso anterior.</p>
    </div>
  );
}

function HourBars({ rows }: { rows: SalesOverview["byHour"] }) {
  const max = Math.max(1, ...rows.map((r) => r.calls));
  return (
    <div>
      <div className="flex h-36 items-end gap-1.5 border-b border-slate-800">
        {rows.map((r) => (
          <div key={r.hour} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-blue-500/80 transition group-hover:bg-blue-400"
              style={{ height: `${(r.calls / max) * 100}%`, minHeight: r.calls > 0 ? 3 : 0 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-200 shadow-lg group-hover:block">
              <div className="font-semibold">{r.hour}:00 – {r.hour + 1}:00</div>
              <div>{r.calls} llamadas</div>
              <div className="text-slate-400">{pct(r.contacted, r.calls)}% contactados · {r.positive} interesados</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-center text-[10px] text-slate-500 tabular-nums">
        {rows.map((r) => (
          <span key={r.hour} className="flex-1">
            {r.hour}
          </span>
        ))}
      </div>
    </div>
  );
}

function ConversionMeter({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-slate-800">
        <span className="block h-full rounded-full bg-blue-500" style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="tabular-nums text-slate-200">{value}%</span>
    </span>
  );
}

function Kpi({ label, value, hint, accent, warn }: { label: string; value: string; hint: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="surface p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {accent && <Banknote className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.25} />}
        {label}
      </p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums ${warn ? "text-amber-300" : "text-slate-100"}`}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
    </div>
  );
}

function Panel({ icon, title, subtitle, children }: { icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="surface p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
          <span className="text-slate-500">{icon}</span>
          {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function MiniStat({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="rounded-lg bg-slate-900/60 px-2 py-3">
      <p className="text-lg font-semibold tabular-nums text-slate-100">{value}</p>
      <p className="text-[11px] text-slate-500">
        {label}
        {of !== undefined && of > 0 && ` · ${pct(value, of)}%`}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-2 py-2 text-right">{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-2 text-right tabular-nums">{children}</td>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-slate-500">{children}</span>;
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs text-slate-600">{children}</p>;
}
