"use client";

import { DIGITAL_NEED_LABEL } from "@/lib/scraper/digital-need";

/**
 * Pastilla de "necesidad digital" — se usa tanto en la fila de la tabla de
 * Negocios como en la cabecera de la ficha, para que se vea igual en los dos
 * sitios. `score` 0 = sin señales (no se ha detectado nada, no significa
 * "ya tiene web perfecta").
 */
export function DigitalNeedBadge({ score, signals }: { score: number; signals: string[] }) {
  if (score <= 0 || signals.length === 0) {
    return <span className="text-xs text-slate-600">—</span>;
  }

  const tone =
    score >= 40
      ? "bg-red-500/10 text-red-300 border-red-500/20"
      : "bg-amber-500/10 text-amber-300 border-amber-500/20";

  return (
    <span
      title={signals.map((s) => DIGITAL_NEED_LABEL[s] ?? s).join(" · ")}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      {DIGITAL_NEED_LABEL[signals[0]] ?? signals[0]}
      {signals.length > 1 && ` +${signals.length - 1}`}
    </span>
  );
}
