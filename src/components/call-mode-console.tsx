"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  ExternalLink,
  Mail,
  MapPin,
  PartyPopper,
  Phone,
  SkipForward,
  Star,
  X,
} from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import { STATUS_LABEL, STATUS_OPTIONS } from "@/lib/businesses/labels";
import { useToast } from "@/components/toast-provider";

interface QueueItem {
  id: string;
  name: string;
  address: string;
  mapsPhone: string;
  webPhones: string[];
  website: string;
  emails: string[];
  rating: number;
  category: string;
  zone: string;
  keyword: string;
  status: string;
  priority: string;
  contactName: string;
  contactRole: string;
  tags: string[];
}

// Mismo color que ya usan los botones "Registrar llamada" del cajón — verde
// para la acción de guardar, y un tono neutro para lo que no es una decisión
// final (Pendiente).
const OUTCOME_TONE: Record<string, string> = {
  PENDING: "border-slate-700 text-slate-300 hover:border-slate-600",
  NO_ANSWER: "border-amber-500/30 text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/5",
  CALLBACK_LATER: "border-blue-500/30 text-blue-300 hover:border-blue-500/50 hover:bg-blue-500/5",
  INTERESTED: "border-emerald-500/30 text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/5",
  NOT_INTERESTED: "border-red-500/30 text-red-300 hover:border-red-500/50 hover:bg-red-500/5",
  CUSTOMER: "border-purple-500/30 text-purple-300 hover:border-purple-500/50 hover:bg-purple-500/5",
  INVALID_NUMBER: "border-slate-700 text-slate-500 hover:border-slate-600",
};

export function CallModeConsole({ initialQueue }: { initialQueue: QueueItem[] }) {
  const showToast = useToast();
  const [queue, setQueue] = useState(initialQueue);
  const [index, setIndex] = useState(0);
  const [notes, setNotes] = useState("");
  const [setFollowUp, setSetFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = queue[index];

  async function logCall(outcome: string) {
    if (!current || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/businesses/${current.id}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome,
          notes,
          ...(setFollowUp && { nextFollowUpAt: followUpDate ? new Date(followUpDate).toISOString() : null }),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error registrando la llamada");
      showToast(`${current.name} → ${STATUS_LABEL[outcome]}`);
      advance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function advance() {
    setNotes("");
    setSetFollowUp(false);
    setFollowUpDate("");
    setIndex((i) => i + 1);
  }

  function skip() {
    setQueue((prev) => {
      const rest = [...prev];
      const [item] = rest.splice(index, 1);
      return item ? [...rest, item] : rest; // lo manda al final, no lo pierde
    });
    setNotes("");
  }

  // Atajos 1-7 para los resultados de llamada — desactivados mientras se
  // escribe en notas o en la fecha, para no interceptar el propio texto.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") return;
      const n = Number(e.key);
      if (n >= 1 && n <= STATUS_OPTIONS.length) {
        logCall(STATUS_OPTIONS[n - 1]);
      } else if (e.key.toLowerCase() === "s") {
        skip();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // Sin array de dependencias a propósito: se re-suscribe en cada render
    // para que el handler siempre cierre sobre el `index`/`queue` actuales,
    // sin depender de mantener una lista de dependencias a mano.
  });

  const progressPct = useMemo(
    () => (queue.length > 0 ? Math.round((index / queue.length) * 100) : 0),
    [index, queue.length]
  );

  if (!current) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <PartyPopper className="h-7 w-7" strokeWidth={2} />
        </span>
        <div>
          <h1 className="text-lg font-semibold text-slate-100">Nada pendiente por hoy</h1>
          <p className="mt-1 text-sm text-slate-500">
            {queue.length === 0 ? "No hay negocios con seguimiento para hoy." : "Has llegado al final de la lista de hoy."}
          </p>
        </div>
        <Link
          href="/businesses"
          prefetch={false}
          className="mt-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500"
        >
          Ver todos los negocios
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-6">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5">
        {/* ── Cabecera: progreso + salir ─────────────── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-slate-500 tabular-nums">
              {index + 1} de {queue.length}
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
          <Link href="/businesses" prefetch={false} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
            Salir
          </Link>
        </div>

        {/* ── Ficha del negocio ──────────────────────── */}
        <div className="surface flex flex-1 flex-col gap-5 p-7">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-100">{current.name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} />
                {current.zone}
              </span>
              {current.category && <span>{current.category}</span>}
              {current.rating > 0 && (
                <span className="flex items-center gap-1">
                  {current.rating}
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                </span>
              )}
              {current.contactName && <span>Contacto: {current.contactName}{current.contactRole ? ` (${current.contactRole})` : ""}</span>}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {current.mapsPhone && (
              <a href={`tel:${current.mapsPhone}`} className="flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200 transition hover:bg-slate-900">
                <Phone className="h-4 w-4 flex-shrink-0 text-blue-400" strokeWidth={2.25} />
                {current.mapsPhone}
              </a>
            )}
            {current.webPhones.map((p) => (
              <a key={p} href={`tel:${p}`} className="flex items-center gap-2 rounded-lg bg-slate-900/60 px-3 py-2.5 text-sm text-slate-200 transition hover:bg-slate-900">
                <Phone className="h-4 w-4 flex-shrink-0 text-slate-500" strokeWidth={2.25} />
                {p}
              </a>
            ))}
            {current.website && (
              <a href={current.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 truncate rounded-lg bg-slate-900/60 px-3 py-2.5 text-sm text-blue-400 transition hover:bg-slate-900">
                <ExternalLink className="h-4 w-4 flex-shrink-0" strokeWidth={2.25} />
                <span className="truncate">{current.website}</span>
              </a>
            )}
            {current.emails.map((e) => (
              <a key={e} href={`mailto:${e}`} className="flex items-center gap-2 truncate rounded-lg bg-slate-900/60 px-3 py-2.5 text-sm text-slate-300 transition hover:bg-slate-900">
                <Mail className="h-4 w-4 flex-shrink-0 text-slate-500" strokeWidth={2.25} />
                <span className="truncate">{e}</span>
              </a>
            ))}
          </div>

          {current.address && <p className="text-xs text-slate-500">{current.address}</p>}

          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas de la llamada…"
            rows={3}
            className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
          />

          <div>
            <label className="flex items-center gap-2 text-xs text-slate-400">
              <input type="checkbox" checked={setFollowUp} onChange={(e) => setSetFollowUp(e.target.checked)} className="accent-blue-600" />
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.25} />
              Fijar próxima llamada
            </label>
            {setFollowUp && (
              <input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
              />
            )}
          </div>

          {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

          {/* ── Resultado ──────────────────────────────── */}
          <div className="mt-auto grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STATUS_OPTIONS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => logCall(s)}
                disabled={submitting}
                className={`flex flex-col items-center gap-1 rounded-lg border bg-slate-950/40 px-3 py-3 text-xs font-semibold transition disabled:opacity-40 ${OUTCOME_TONE[s]}`}
              >
                <span className="font-mono text-[10px] text-slate-600">{i + 1}</span>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={skip}
            className="flex items-center justify-center gap-1.5 self-center text-xs font-medium text-slate-500 hover:text-slate-300"
          >
            <SkipForward className="h-3.5 w-3.5" strokeWidth={2.25} />
            Saltar por ahora (S)
          </button>
        </div>
      </div>
    </div>
  );
}
