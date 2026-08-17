"use client";

import { useEffect, useState } from "react";
import {
  Banknote,
  CheckCheck,
  ExternalLink,
  Flag,
  FlagOff,
  Gauge,
  History,
  Loader2,
  MapPin,
  PhoneCall,
  RefreshCw,
  Save,
  ShieldAlert,
  Star,
  Tag,
  TriangleAlert,
  UserCircle,
  X,
} from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import {
  AUDIT_ACTION_LABEL,
  completenessScore,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  PRODUCT_LABEL,
  PRODUCT_OPTIONS,
  STATUS_BADGE,
  STATUS_LABEL,
  STATUS_OPTIONS,
  TAG_SUGGESTIONS,
} from "@/lib/businesses/labels";
import { isValidSpanishPhone } from "@/lib/businesses/phone";
import type { BusinessRow } from "@/components/businesses-console";

interface CallActivityRow {
  id: string;
  outcome: string;
  notes: string;
  createdAt: string;
  user: { id: string; name: string };
}
interface AuditLogRow {
  id: string;
  action: string;
  detail: string;
  createdAt: string;
  user: { id: string; name: string };
}
type BusinessDetail = BusinessRow & { callActivities: CallActivityRow[]; auditLogs: AuditLogRow[] };
type SimpleUser = { id: string; name: string };

const STALE_DAYS = 90;

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function BusinessDrawer({
  businessId,
  isAdmin,
  assignableUsers,
  onClose,
  onUpdated,
}: {
  businessId: string;
  isAdmin: boolean;
  assignableUsers: SimpleUser[];
  onClose: () => void;
  onUpdated: (b: BusinessRow) => void;
}) {
  const [business, setBusiness] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulario de edición
  const [status, setStatus] = useState("PENDING");
  const [priority, setPriority] = useState("MEDIUM");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");
  const [dealValue, setDealValue] = useState("0");
  const [product, setProduct] = useState("");
  const [closedAt, setClosedAt] = useState("");

  // Formulario de registrar llamada
  const [callOutcome, setCallOutcome] = useState("NO_ANSWER");
  const [callNotes, setCallNotes] = useState("");
  const [callSetFollowUp, setCallSetFollowUp] = useState(false);
  const [callFollowUpDate, setCallFollowUpDate] = useState("");
  const [loggingCall, setLoggingCall] = useState(false);

  const [rescraping, setRescraping] = useState(false);
  const [flagNote, setFlagNote] = useState("");
  const [flagging, setFlagging] = useState(false);

  // Recarga la ficha completa (incluye auditLogs/callActivities, que el PATCH
  // de guardar cambios no devuelve) — para que el Historial se vea al día
  // sin tener que cerrar y volver a abrir el cajón.
  async function refetchDetail() {
    const res = await queuedFetch(`/api/businesses/${businessId}`);
    if (res.ok) setBusiness(await res.json());
  }

  useEffect(() => {
    let cancelled = false;
    queuedFetch(`/api/businesses/${businessId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data: BusinessDetail = await res.json();
        if (cancelled) return;
        setBusiness(data);
        setStatus(data.status);
        setPriority(data.priority);
        setContactName(data.contactName);
        setContactRole(data.contactRole);
        setTags(data.tags);
        setNextFollowUpAt(toDateInputValue(data.nextFollowUpAt as unknown as string | null));
        setAssignedToUserId(data.assignedTo?.id ?? "");
        setDealValue(String(data.dealValue ?? 0));
        setProduct(data.product ?? "");
        setClosedAt(toDateInputValue(data.closedAt as unknown as string | null));
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [businessId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          priority,
          contactName,
          contactRole,
          tags,
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null,
          dealValue: parseFloat(dealValue.replace(",", ".")) || 0,
          product: product || null,
          closedAt: closedAt ? new Date(closedAt).toISOString() : null,
          ...(isAdmin && { assignedToUserId: assignedToUserId || null }),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error guardando");
      const updated = await res.json();
      onUpdated(updated);
      await refetchDetail(); // trae también los AuditLog que el PATCH haya generado
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleLogCall(e: React.FormEvent) {
    e.preventDefault();
    setLoggingCall(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/businesses/${businessId}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outcome: callOutcome,
          notes: callNotes,
          ...(callSetFollowUp && {
            nextFollowUpAt: callFollowUpDate ? new Date(callFollowUpDate).toISOString() : null,
          }),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error registrando la llamada");
      const { activity, business: updatedBusiness } = await res.json();
      setBusiness((prev) =>
        prev ? { ...prev, ...updatedBusiness, callActivities: [activity, ...prev.callActivities] } : prev
      );
      setStatus(updatedBusiness.status);
      if (callSetFollowUp) setNextFollowUpAt(toDateInputValue(updatedBusiness.nextFollowUpAt));
      onUpdated(updatedBusiness);
      setCallNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoggingCall(false);
    }
  }

  async function handleRescrape() {
    setRescraping(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/businesses/${businessId}/rescrape`, { method: "POST" });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated?.error || "Error re-scrapeando");
      setBusiness((prev) => (prev ? { ...prev, ...updated } : prev));
      onUpdated(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRescraping(false);
    }
  }

  async function handleToggleFlag() {
    if (!business) return;
    const next = !business.flaggedIncorrect;
    setFlagging(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/businesses/${businessId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flaggedIncorrect: next, flaggedIncorrectNote: next ? flagNote : "" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error guardando");
      const updated = await res.json();
      onUpdated(updated);
      if (next) setFlagNote("");
      await refetchDetail();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFlagging(false);
    }
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-slate-800 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/95 px-5 py-3.5 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <MapPin className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <h2 className="truncate text-sm font-semibold text-slate-100">
              {business?.name || "Cargando…"}
            </h2>
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
        {error && <div className="mx-5 mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</div>}

        {business && (
          <div className="flex flex-1 flex-col gap-5 p-5">
            {/* Datos scrapeados (solo lectura) */}
            <section className="surface p-4 text-sm">
              <div className="mb-3 flex items-center justify-between">
                <SectionTitle className="!mb-0">Datos del negocio</SectionTitle>
                <div className="flex items-center gap-2">
                  <span
                    className="flex items-center gap-1 text-[10px] font-semibold text-slate-500"
                    title="% de campos de scraping rellenos"
                  >
                    <Gauge className="h-3 w-3" strokeWidth={2.25} />
                    {completenessScore(business)}%
                  </span>
                  {business.mapsUrl && (
                    <a
                      href={business.mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir en Google Maps"
                      className="text-slate-500 hover:text-slate-300"
                    >
                      <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                    </a>
                  )}
                  <button
                    onClick={handleRescrape}
                    disabled={rescraping || !business.mapsUrl}
                    title={business.mapsUrl ? "Volver a leer esta ficha en Maps" : "Sin enlace de Maps guardado — no se puede re-scrapear"}
                    className="flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-slate-700 hover:text-slate-200 disabled:opacity-30"
                  >
                    {rescraping ? (
                      <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} />
                    ) : (
                      <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
                    )}
                    {rescraping ? "Leyendo…" : "Re-scrapear"}
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">Dirección</dt>
                <dd className="text-slate-300">{business.address || "—"}</dd>
                <dt className="text-slate-500">Zona / tipo</dt>
                <dd className="text-slate-300">
                  {business.zone} · {business.keyword || business.category || "—"}
                </dd>
                <dt className="text-slate-500">Tel. Maps</dt>
                <dd className="flex items-center gap-1.5 text-slate-300">
                  {business.mapsPhone || "—"}
                  {business.mapsPhone && !isValidSpanishPhone(business.mapsPhone) && (
                    <span title="No parece un teléfono español válido" className="text-amber-400">
                      <TriangleAlert className="h-3 w-3" strokeWidth={2.5} />
                    </span>
                  )}
                </dd>
                <dt className="text-slate-500">Tel. web</dt>
                <dd className="flex flex-wrap items-center gap-1.5 text-slate-300">
                  {business.webPhones.length === 0
                    ? "—"
                    : business.webPhones.map((p) => (
                        <span key={p} className="flex items-center gap-1">
                          {p}
                          {!isValidSpanishPhone(p) && (
                            <span title="No parece un teléfono español válido" className="text-amber-400">
                              <TriangleAlert className="h-3 w-3" strokeWidth={2.5} />
                            </span>
                          )}
                        </span>
                      ))}
                </dd>
                <dt className="text-slate-500">Web</dt>
                <dd className="truncate text-blue-400">
                  {business.website ? (
                    <a href={business.website} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      {business.website}
                    </a>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-slate-500">Emails</dt>
                <dd className="text-slate-300">{business.emails.join(", ") || "—"}</dd>
                <dt className="text-slate-500">Rating</dt>
                <dd className="flex items-center gap-1 text-slate-300">
                  {business.rating ? (
                    <>
                      {business.rating}
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                    </>
                  ) : (
                    "—"
                  )}
                </dd>
                <dt className="text-slate-500">Verificado</dt>
                <dd className="flex items-center gap-1.5 text-slate-300">
                  {business.lastVerifiedAt
                    ? new Date(business.lastVerifiedAt).toLocaleDateString("es-ES")
                    : "—"}
                  {business.lastVerifiedAt && daysSince(business.lastVerifiedAt as unknown as string) > STALE_DAYS && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/20">
                      <ShieldAlert className="h-2.5 w-2.5" strokeWidth={2.5} />
                      hace {daysSince(business.lastVerifiedAt as unknown as string)} días
                    </span>
                  )}
                </dd>
              </dl>

              <div className="mt-3 border-t border-slate-800/70 pt-3">
                {business.flaggedIncorrect ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs">
                    <span className="flex items-center gap-1.5 text-red-300">
                      <Flag className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.25} />
                      {business.flaggedIncorrectNote || "Marcado como dato incorrecto"}
                    </span>
                    <button
                      onClick={handleToggleFlag}
                      disabled={flagging}
                      className="flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-400 hover:text-slate-200"
                    >
                      <FlagOff className="h-3 w-3" strokeWidth={2.5} />
                      Desmarcar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      value={flagNote}
                      onChange={(e) => setFlagNote(e.target.value)}
                      placeholder="Motivo (teléfono caducado, negocio cerrado…)"
                      className="flex-1 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                    />
                    <button
                      onClick={handleToggleFlag}
                      disabled={flagging}
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg border border-slate-800 px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 transition hover:border-red-500/40 hover:text-red-300"
                    >
                      <Flag className="h-3 w-3" strokeWidth={2.25} />
                      Marcar dato incorrecto
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Formulario de gestión */}
            <section className="surface p-4">
              <SectionTitle>Seguimiento</SectionTitle>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Estado">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Prioridad">
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                  >
                    {PRIORITY_OPTIONS.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABEL[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Persona de contacto">
                  <div className="relative">
                    <UserCircle className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" strokeWidth={2} />
                    <input
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 py-1.5 pl-8 pr-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </Field>
                <Field label="Cargo">
                  <input
                    value={contactRole}
                    onChange={(e) => setContactRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                  />
                </Field>
                <Field label="Próxima llamada">
                  <input
                    type="date"
                    value={nextFollowUpAt}
                    onChange={(e) => setNextFollowUpAt(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                  />
                </Field>
                {isAdmin && (
                  <Field label="Asignado a">
                    <select
                      value={assignedToUserId}
                      onChange={(e) => setAssignedToUserId(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="">Sin asignar</option>
                      {assignableUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              <Field label="Etiquetas" className="mt-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {tags.map((t) => (
                    <span
                      key={t}
                      className="flex items-center gap-1 rounded-full bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      <Tag className="h-2.5 w-2.5 text-slate-500" strokeWidth={2.5} />
                      {t}
                      <button
                        onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                        className="text-slate-500 hover:text-red-400"
                      >
                        <X className="h-2.5 w-2.5" strokeWidth={3} />
                      </button>
                    </span>
                  ))}
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                    onBlur={addTag}
                    placeholder="+ añadir"
                    className="w-24 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
                  />
                </div>
                {TAG_SUGGESTIONS.some((s) => !tags.includes(s)) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {TAG_SUGGESTIONS.filter((s) => !tags.includes(s)).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setTags((prev) => [...prev, s])}
                        className="rounded-full border border-slate-800 px-2 py-0.5 text-[10px] text-slate-500 transition hover:border-slate-700 hover:text-slate-300"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                )}
              </Field>

              <div className="mt-4 border-t border-slate-800/70 pt-4">
                <div className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Banknote className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
                  Venta
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Producto">
                    <select
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                    >
                      <option value="">—</option>
                      {PRODUCT_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {PRODUCT_LABEL[p]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Importe (€)">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={dealValue}
                      onChange={(e) => setDealValue(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                    />
                  </Field>
                  <Field label="Fecha de cierre">
                    <input
                      type="date"
                      value={closedAt}
                      onChange={(e) => setClosedAt(e.target.value)}
                      className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                    />
                  </Field>
                </div>
              </div>

              <button
                onClick={handleSave}
                disabled={saving}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Save className="h-4 w-4" strokeWidth={2.25} />}
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </section>

            {/* Registrar llamada */}
            <section className="surface p-4">
              <SectionTitle>Registrar llamada</SectionTitle>
              <form onSubmit={handleLogCall} className="flex flex-col gap-3">
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
                <textarea
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Notas de la llamada…"
                  rows={3}
                  className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
                />
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    checked={callSetFollowUp}
                    onChange={(e) => setCallSetFollowUp(e.target.checked)}
                    className="accent-blue-600"
                  />
                  Fijar próxima llamada
                </label>
                {callSetFollowUp && (
                  <input
                    type="date"
                    value={callFollowUpDate}
                    onChange={(e) => setCallFollowUpDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
                  />
                )}
                <button
                  type="submit"
                  disabled={loggingCall}
                  className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-emerald-950/40 transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {loggingCall ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <PhoneCall className="h-4 w-4" strokeWidth={2.25} />}
                  {loggingCall ? "Guardando…" : "Registrar llamada"}
                </button>
              </form>
            </section>

            {/* Historial: llamadas + cambios de gestión, mezclados por fecha */}
            <section>
              <div className="mb-3 flex items-center gap-1.5">
                <History className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
                <SectionTitle className="!mb-0">Historial</SectionTitle>
              </div>
              {business.callActivities.length === 0 && business.auditLogs.length === 0 ? (
                <p className="text-xs text-slate-600">Todavía no hay actividad registrada.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {[
                    ...business.callActivities.map((a) => ({ type: "call" as const, at: a.createdAt, data: a })),
                    ...business.auditLogs.map((a) => ({ type: "audit" as const, at: a.createdAt, data: a })),
                  ]
                    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
                    .map((entry) =>
                      entry.type === "call" ? (
                        <li key={`call-${entry.data.id}`} className="surface p-3 text-xs">
                          <div className="mb-1 flex items-center justify-between">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[entry.data.outcome]}`}>
                              {STATUS_LABEL[entry.data.outcome]}
                            </span>
                            <span className="text-slate-500">
                              {entry.data.user.name} · {new Date(entry.data.createdAt).toLocaleString("es-ES")}
                            </span>
                          </div>
                          {entry.data.notes && <p className="text-slate-300">{entry.data.notes}</p>}
                        </li>
                      ) : (
                        <li key={`audit-${entry.data.id}`} className="flex items-center gap-2 px-1 py-1 text-xs text-slate-500">
                          <CheckCheck className="h-3 w-3 flex-shrink-0 text-slate-600" strokeWidth={2.25} />
                          <span className="text-slate-400">{AUDIT_ACTION_LABEL[entry.data.action] ?? entry.data.action}</span>
                          <span>· {entry.data.detail}</span>
                          <span className="ml-auto flex-shrink-0">
                            {entry.data.user.name} · {new Date(entry.data.createdAt).toLocaleString("es-ES")}
                          </span>
                        </li>
                      )
                    )}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}
