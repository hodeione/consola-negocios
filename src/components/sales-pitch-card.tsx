"use client";

import { useState } from "react";
import { ChevronDown, Copy, Lightbulb, MessageCircle, MessageSquareQuote, Target } from "lucide-react";
import { CONFIDENCE_BADGE, recommendSale, type SalesInput } from "@/lib/businesses/sales-recommendation";
import { PRODUCT_LABEL } from "@/lib/businesses/labels";
import { isSpanishMobile, whatsappLink } from "@/lib/businesses/phone";
import { useToast } from "@/components/toast-provider";

/**
 * Tarjeta "Qué venderle": producto recomendado + precio + argumentos + guion
 * y objeciones. Se usa en la ficha del negocio y en el modo llamada.
 */
export function SalesPitchCard({
  business,
  phones,
  defaultOpenScript = false,
  onUseProduct,
}: {
  business: SalesInput;
  phones: string[];
  defaultOpenScript?: boolean;
  onUseProduct?: (product: string) => void;
}) {
  const showToast = useToast();
  const [openScript, setOpenScript] = useState(defaultOpenScript);
  const rec = recommendSale(business);
  const badge = CONFIDENCE_BADGE[rec.confidence];
  const mobile = phones.find((p) => p && isSpanishMobile(p));

  async function copyOpening() {
    try {
      await navigator.clipboard.writeText(rec.opening);
      showToast("Frase de apertura copiada");
    } catch {
      showToast("No se pudo copiar");
    }
  }

  return (
    <section className="surface overflow-hidden">
      <div className="border-b border-slate-800/70 bg-gradient-to-r from-blue-500/10 via-transparent to-transparent p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-blue-300">
              <Target className="h-3.5 w-3.5" strokeWidth={2.25} />
              Qué venderle
            </p>
            <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-lg font-semibold text-slate-100">{PRODUCT_LABEL[rec.product] ?? rec.product}</span>
              <span className="font-mono text-sm text-slate-400 tabular-nums">{rec.price}</span>
            </p>
          </div>
          <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}>{badge.label}</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">{rec.headline}</p>
        <p className="mt-1 text-[11px] text-slate-500">Sector detectado: {rec.sectorLabel}</p>
      </div>

      <div className="space-y-3 p-4">
        <ul className="space-y-1.5">
          {rec.arguments.map((a) => (
            <li key={a} className="flex gap-2 text-xs leading-relaxed text-slate-300">
              <Lightbulb className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" strokeWidth={2.25} />
              {a}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          {mobile && (
            <a
              href={whatsappLink(mobile, rec.whatsappMessage)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
              WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={copyOpening}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
            Copiar apertura
          </button>
          {onUseProduct && (
            <button
              type="button"
              onClick={() => onUseProduct(rec.product)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-blue-500/40 hover:text-blue-300"
            >
              Usar como producto
            </button>
          )}
        </div>

        <div className="rounded-lg border border-slate-800/80">
          <button
            type="button"
            onClick={() => setOpenScript((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-300 hover:text-slate-100"
          >
            <span className="flex items-center gap-1.5">
              <MessageSquareQuote className="h-3.5 w-3.5 text-blue-400" strokeWidth={2.25} />
              Guion de llamada y objeciones
            </span>
            <ChevronDown className={`h-3.5 w-3.5 transition ${openScript ? "rotate-180" : ""}`} strokeWidth={2.25} />
          </button>
          {openScript && (
            <div className="space-y-3 border-t border-slate-800/80 px-3 py-3 text-xs leading-relaxed">
              <p className="rounded-md bg-blue-500/5 p-2.5 text-slate-200">“{rec.opening}”</p>
              <dl className="space-y-2">
                {rec.objections.map((o) => (
                  <div key={o.q}>
                    <dt className="font-semibold text-slate-400">— {o.q}</dt>
                    <dd className="mt-0.5 text-slate-300">{o.a}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
