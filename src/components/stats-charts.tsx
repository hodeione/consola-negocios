"use client";

import { useState } from "react";
import { fmtHMS } from "@/lib/format";

// Paleta validada (node scripts/validate_palette.js, modo dark): las dos
// series de la gráfica apilada (activo/inactivo) pasan CVD con el hueco de
// 2px entre segmentos como mitigación del único WARN (protanopía, ΔE 7.9,
// dentro del rango "legal solo con codificación secundaria"). Llamadas usa
// el azul de acento de la propia app, ya usado en botones/enlaces.
export const CHART_COLORS = {
  active: "#059669", // emerald-600
  idle: "#d97706", // amber-600
  calls: "#2563eb", // blue-600
};

export { fmtHMS };

function fmtDayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit" });
}

const CHART_HEIGHT = 120;
const BAR_MAX_WIDTH = 22;
const GAP = 2;

interface Tooltip {
  x: number;
  label: string;
  lines: { color: string; text: string }[];
}

/**
 * Barras apiladas por día: minutos activos vs. minutos con posible
 * inactividad mientras se estaba fichado. La suma de la pila = tiempo
 * fichado ese día — así una sola gráfica responde "cuánto se trabajó" y
 * "cuánto de eso tiene actividad real detrás".
 */
export function ActiveIdleChart({ daily }: { daily: { date: string; activeMinutes: number; idleMinutes: number }[] }) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.activeMinutes + d.idleMinutes));
  const n = daily.length || 1;
  const slot = 100 / n;
  const barWidth = Math.min(BAR_MAX_WIDTH, slot * 0.6);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center gap-4 text-[11px]">
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.active }} />
          Activo
        </span>
        <span className="flex items-center gap-1.5 text-slate-400">
          <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: CHART_COLORS.idle }} />
          Posible inactividad
        </span>
      </div>
      <svg viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none" className="h-32 w-full overflow-visible">
        {/* Línea base */}
        <line x1="0" y1={CHART_HEIGHT - 14} x2="100" y2={CHART_HEIGHT - 14} stroke="#1e293b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {daily.map((d, i) => {
          const total = d.activeMinutes + d.idleMinutes;
          const cx = slot * i + slot / 2;
          const totalH = (total / max) * (CHART_HEIGHT - 24);
          const activeH = total > 0 ? (d.activeMinutes / total) * totalH : 0;
          const idleH = total > 0 ? (d.idleMinutes / total) * totalH : 0;
          const baseline = CHART_HEIGHT - 14;
          const idleY = baseline - idleH;
          const activeY = idleY - activeH - (idleH > 0 && activeH > 0 ? GAP : 0);

          return (
            <g
              key={d.date}
              onMouseEnter={() =>
                setTooltip({
                  x: cx,
                  label: fmtDayLabel(d.date),
                  lines: [
                    { color: CHART_COLORS.active, text: `Activo: ${fmtHMS(d.activeMinutes)}` },
                    { color: CHART_COLORS.idle, text: `Inactividad: ${fmtHMS(d.idleMinutes)}` },
                  ],
                })
              }
              onMouseLeave={() => setTooltip(null)}
              tabIndex={0}
              onFocus={() =>
                setTooltip({
                  x: cx,
                  label: fmtDayLabel(d.date),
                  lines: [
                    { color: CHART_COLORS.active, text: `Activo: ${fmtHMS(d.activeMinutes)}` },
                    { color: CHART_COLORS.idle, text: `Inactividad: ${fmtHMS(d.idleMinutes)}` },
                  ],
                })
              }
              onBlur={() => setTooltip(null)}
              className="cursor-pointer outline-none"
            >
              {/* hit area, más ancha que la barra */}
              <rect x={cx - slot / 2} y={0} width={slot} height={CHART_HEIGHT} fill="transparent" />
              {activeH > 0 && (
                <rect
                  x={cx - barWidth / 2}
                  y={activeY}
                  width={barWidth}
                  height={activeH}
                  rx={idleH > 0 ? 2 : 4}
                  fill={CHART_COLORS.active}
                  opacity={tooltip && tooltip.label !== fmtDayLabel(d.date) ? 0.55 : 1}
                />
              )}
              {idleH > 0 && (
                <rect
                  x={cx - barWidth / 2}
                  y={idleY}
                  width={barWidth}
                  height={idleH}
                  rx={activeH > 0 ? 2 : 4}
                  fill={CHART_COLORS.idle}
                  opacity={tooltip && tooltip.label !== fmtDayLabel(d.date) ? 0.55 : 1}
                />
              )}
              {total === 0 && <rect x={cx - barWidth / 2} y={baseline - 2} width={barWidth} height={2} rx={1} fill="#1e293b" />}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[9px] text-slate-600" style={{ display: "flex" }}>
        {daily.map((d, i) => (
          <span key={d.date} style={{ width: `${slot}%`, textAlign: "center" }} className={i % Math.ceil(n / 8 || 1) === 0 ? "" : "opacity-0"}>
            {fmtDayLabel(d.date)}
          </span>
        ))}
      </div>
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-[11px] shadow-xl"
          style={{ left: `${tooltip.x}%`, top: -8 }}
        >
          <div className="mb-1 font-semibold text-slate-300">{tooltip.label}</div>
          {tooltip.lines.map((l) => (
            <div key={l.text} className="flex items-center gap-1.5 text-slate-400">
              <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: l.color }} />
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Barras simples por día — una sola serie (llamadas). */
export function SimpleDailyChart({
  daily,
  color = CHART_COLORS.calls,
  formatValue = (v) => String(v),
}: {
  daily: { date: string; value: number }[];
  color?: string;
  formatValue?: (v: number) => string;
}) {
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const max = Math.max(1, ...daily.map((d) => d.value));
  const n = daily.length || 1;
  const slot = 100 / n;
  const barWidth = Math.min(BAR_MAX_WIDTH, slot * 0.6);
  const baseline = CHART_HEIGHT - 14;

  return (
    <div className="relative">
      <svg viewBox={`0 0 100 ${CHART_HEIGHT}`} preserveAspectRatio="none" className="h-32 w-full overflow-visible">
        <line x1="0" y1={baseline} x2="100" y2={baseline} stroke="#1e293b" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {daily.map((d, i) => {
          const cx = slot * i + slot / 2;
          const h = (d.value / max) * (CHART_HEIGHT - 24);
          return (
            <g
              key={d.date}
              onMouseEnter={() => setTooltip({ x: cx, label: fmtDayLabel(d.date), lines: [{ color, text: formatValue(d.value) }] })}
              onMouseLeave={() => setTooltip(null)}
              tabIndex={0}
              onFocus={() => setTooltip({ x: cx, label: fmtDayLabel(d.date), lines: [{ color, text: formatValue(d.value) }] })}
              onBlur={() => setTooltip(null)}
              className="cursor-pointer outline-none"
            >
              <rect x={cx - slot / 2} y={0} width={slot} height={CHART_HEIGHT} fill="transparent" />
              {d.value > 0 ? (
                <rect
                  x={cx - barWidth / 2}
                  y={baseline - h}
                  width={barWidth}
                  height={h}
                  rx={4}
                  fill={color}
                  opacity={tooltip && tooltip.label !== fmtDayLabel(d.date) ? 0.55 : 1}
                />
              ) : (
                <rect x={cx - barWidth / 2} y={baseline - 2} width={barWidth} height={2} rx={1} fill="#1e293b" />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[9px] text-slate-600">
        {daily.map((d, i) => (
          <span key={d.date} style={{ width: `${slot}%`, textAlign: "center" }} className={i % Math.ceil(n / 8 || 1) === 0 ? "" : "opacity-0"}>
            {fmtDayLabel(d.date)}
          </span>
        ))}
      </div>
      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950/95 px-2.5 py-2 text-[11px] shadow-xl"
          style={{ left: `${tooltip.x}%`, top: -8 }}
        >
          <div className="mb-1 font-semibold text-slate-300">{tooltip.label}</div>
          {tooltip.lines.map((l) => (
            <div key={l.text} className="flex items-center gap-1.5 text-slate-400">
              <span className="h-1.5 w-3 rounded-sm" style={{ backgroundColor: l.color }} />
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
