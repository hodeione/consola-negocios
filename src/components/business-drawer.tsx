"use client";

import { useEffect, useState } from "react";
import {
  Loader2,
  MapPin,
  PhoneCall,
  Save,
  Star,
  Tag,
  UserCircle,
  X,
} from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import {
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  STATUS_BADGE,
  STATUS_LABEL,
  STATUS_OPTIONS,
} from "@/lib/businesses/labels";
import type { BusinessRow } from "@/components/businesses-console";

interface CallActivityRow {
  id: string;
  outcome: string;
  notes: string;
  createdAt: string;
  user: { id: string; name: string };
}
type BusinessDetail = BusinessRow & { callActivities: CallActivityRow[] };
type SimpleUser = { id: string; name: string };

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
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

  // Formulario de registrar llamada
  const [callOutcome, setCallOutcome] = useState("NO_ANSWER");
  const [callNotes, setCallNotes] = useState("");
  const [callSetFollowUp, setCallSetFollowUp] = useState(false);
  const [callFollowUpDate, setCallFollowUpDate] = useState("");
  const [loggingCall, setLoggingCall] = useState(false);

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
          ...(isAdmin && { assignedToUserId: assignedToUserId || null }),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error guardando");
      const updated = await res.json();
      setBusiness((prev) => (prev ? { ...prev, ...updated } : prev));
      onUpdated(updated);
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
              <SectionTitle>Datos del negocio</SectionTitle>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-slate-500">Dirección</dt>
                <dd className="text-slate-300">{business.address || "—"}</dd>
                <dt className="text-slate-500">Zona / tipo</dt>
                <dd className="text-slate-300">
                  {business.zone} · {business.keyword || business.category || "—"}
                </dd>
                <dt className="text-slate-500">Tel. Maps</dt>
                <dd className="text-slate-300">{business.mapsPhone || "—"}</dd>
                <dt className="text-slate-500">Tel. web</dt>
                <dd className="text-slate-300">{business.webPhones.join(", ") || "—"}</dd>
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
              </dl>
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
              </Field>

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

            {/* Historial */}
            <section>
              <SectionTitle>Historial de llamadas</SectionTitle>
              {business.callActivities.length === 0 ? (
                <p className="text-xs text-slate-600">Todavía no hay llamadas registradas.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {business.callActivities.map((a) => (
                    <li key={a.id} className="surface p-3 text-xs">
                      <div className="mb-1 flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[a.outcome]}`}>
                          {STATUS_LABEL[a.outcome]}
                        </span>
                        <span className="text-slate-500">
                          {a.user.name} · {new Date(a.createdAt).toLocaleString("es-ES")}
                        </span>
                      </div>
                      {a.notes && <p className="text-slate-300">{a.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</div>;
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  );
}
