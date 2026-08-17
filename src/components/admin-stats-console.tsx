"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarClock,
  Check,
  Loader2,
  Pencil,
  Phone,
  Trash2,
  X,
} from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import { STATUS_BADGE, STATUS_LABEL } from "@/lib/businesses/labels";
import type { AgentStats } from "@/lib/admin-stats";
import { AgentDetailDrawer } from "@/components/agent-detail-drawer";

interface TimeEntryRow {
  id: string;
  userId: string;
  clockIn: string;
  clockOut: string | null;
  type: "WORK" | "VACATION" | "ABSENCE";
  note: string;
  editedByAdmin: boolean;
  user: { id: string; name: string; email: string };
}

const ENTRY_TYPE_LABEL: Record<string, string> = { WORK: "Trabajo", VACATION: "Vacaciones", ABSENCE: "Ausencia" };
const ENTRY_TYPE_BADGE: Record<string, string> = {
  VACATION: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  ABSENCE: "bg-purple-500/10 text-purple-300 border border-purple-500/20",
};

const RANGE_PRESETS = [
  { label: "Hoy", days: 1 },
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
];

type SortKey = "revenueInRange" | "callsInRange" | "hoursInRange" | "callsPerHour";
const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "revenueInRange", label: "Ventas" },
  { key: "callsInRange", label: "Llamadas" },
  { key: "hoursInRange", label: "Horas" },
  { key: "callsPerHour", label: "Llam./hora" },
];

function fmtHours(h: number): string {
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  if (hours === 0 && minutes === 0) return "0h";
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function errorMessageFrom(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export function AdminStatsConsole({
  initialAgents,
  initialRange,
  initialOpenEntries,
}: {
  initialAgents: AgentStats[];
  initialRange: { from: string; to: string };
  initialOpenEntries: TimeEntryRow[];
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [range, setRange] = useState(initialRange);
  const [activeDays, setActiveDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<TimeEntryRow[]>(initialOpenEntries);
  const [entriesLoaded, setEntriesLoaded] = useState(false);
  const [openAgent, setOpenAgent] = useState<{ id: string; name: string } | null>(null);
  const [showAbsenceForm, setShowAbsenceForm] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("revenueInRange");

  async function loadRange(days: number) {
    setActiveDays(days);
    setLoading(true);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);
    try {
      const res = await queuedFetch(
        `/api/admin/stats?from=${from.toISOString()}&to=${to.toISOString()}`
      );
      const data = await res.json();
      setAgents(data.agents);
      setRange(data.range);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    queuedFetch("/api/admin/time-entries")
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setEntries(data);
        setEntriesLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function patchEntry(updated: TimeEntryRow) {
    setEntries((prev) => prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));
  }
  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }

  const openCount = entries.filter((e) => !e.clockOut).length;

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <BarChart3 className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-100">Estadísticas</h1>
              <p className="text-xs text-slate-500">Llamadas y horas fichadas por agente.</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-1">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.days}
                onClick={() => loadRange(p.days)}
                disabled={loading}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  activeDays === p.days
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
            {loading && <Loader2 className="mx-1.5 h-3.5 w-3.5 animate-spin text-slate-500" strokeWidth={2.5} />}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              Rango: {new Date(range.from).toLocaleDateString("es-ES")} — {new Date(range.to).toLocaleDateString("es-ES")}
            </span>
            <label className="flex items-center gap-1.5">
              Ordenar por
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortKey)}
                className="rounded-md border border-slate-800 bg-slate-900/70 px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-blue-500"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {agents.reduce((acc, a) => acc + a.revenueInRange, 0) > 0 && (
            <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
              <Banknote className="h-3.5 w-3.5" strokeWidth={2.25} />
              {agents.reduce((acc, a) => acc + a.revenueInRange, 0).toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })} en ventas del equipo
            </span>
          )}
        </div>

        {/* ── Tarjetas por agente, ordenadas por el criterio elegido ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[...agents]
            .sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0))
            .map((a, i) => (
              <AgentCard
                key={a.id}
                agent={a}
                rank={(a[sortBy] ?? 0) > 0 ? i + 1 : null}
                onOpen={() => setOpenAgent({ id: a.id, name: a.name })}
              />
            ))}
        </div>

        {/* ── Fichajes ───────────────────────────────────── */}
        <section className="surface p-5">
          <div className="mb-1 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-slate-500" strokeWidth={2.25} />
              <h2 className="text-sm font-semibold text-slate-100">Fichajes recientes</h2>
              {openCount > 0 && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/20">
                  <AlertTriangle className="h-2.5 w-2.5" strokeWidth={2.5} />
                  {openCount} abierto{openCount > 1 ? "s" : ""}
                </span>
              )}
            </div>
            <button
              onClick={() => setShowAbsenceForm((v) => !v)}
              className="text-xs font-medium text-blue-400 hover:text-blue-300"
            >
              {showAbsenceForm ? "Cancelar" : "+ Vacaciones/ausencia"}
            </button>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Últimos 100. Corrige un fichaje olvidado o mal cerrado con «Editar».
          </p>
          {showAbsenceForm && (
            <AbsenceForm
              agents={agents}
              onCreated={(entry) => {
                setEntries((prev) => [entry, ...prev]);
                setShowAbsenceForm(false);
              }}
            />
          )}
          {!entriesLoaded && entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-600">Cargando…</p>
          ) : entries.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-600">Todavía no hay fichajes.</p>
          ) : (
            <div className="flex flex-col divide-y divide-slate-800/70">
              {entries.map((e) => (
                <EntryRow key={e.id} entry={e} onUpdate={patchEntry} onDelete={removeEntry} />
              ))}
            </div>
          )}
        </section>
      </div>

      {openAgent && (
        <AgentDetailDrawer userId={openAgent.id} name={openAgent.name} range={range} onClose={() => setOpenAgent(null)} />
      )}
    </div>
  );
}

function AbsenceForm({
  agents,
  onCreated,
}: {
  agents: AgentStats[];
  onCreated: (entry: TimeEntryRow) => void;
}) {
  const [userId, setUserId] = useState(agents[0]?.id ?? "");
  const [type, setType] = useState<"VACATION" | "ABSENCE">("VACATION");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId || !from || !to) return;
    setBusy(true);
    setError(null);
    try {
      const res = await queuedFetch("/api/admin/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          type,
          clockIn: new Date(from).toISOString(),
          clockOut: new Date(to).toISOString(),
          note,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      onCreated(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mb-4 flex flex-wrap items-end gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">Persona</label>
        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">Tipo</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as "VACATION" | "ABSENCE")}
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
        >
          <option value="VACATION">Vacaciones</option>
          <option value="ABSENCE">Ausencia</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">Desde</label>
        <input
          type="datetime-local"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          required
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-[10px] font-medium text-slate-500">Hasta</label>
        <input
          type="datetime-local"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota (opcional)"
        className="min-w-32 flex-1 rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-blue-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
      >
        {busy ? "Guardando…" : "Registrar"}
      </button>
      {error && <span className="w-full text-[11px] text-red-400">{error}</span>}
    </form>
  );
}

function AgentCard({ agent, rank, onOpen }: { agent: AgentStats; rank: number | null; onOpen: () => void }) {
  const statusEntries = Object.entries(agent.byStatus).filter(([, n]) => n > 0);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="surface flex flex-col gap-4 p-5 text-left transition hover:border-slate-700"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-slate-300">
            {agent.name.slice(0, 1).toUpperCase()}
            {rank === 1 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px]" title="1º en este criterio">
                🏆
              </span>
            )}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-100">
              {rank && rank <= 3 && <span className="text-[10px] font-mono text-slate-500">#{rank}</span>}
              {agent.name}
            </div>
            <div className="truncate text-[11px] text-slate-500">{agent.email}</div>
          </div>
        </div>
        {!agent.active && (
          <span className="flex-shrink-0 rounded-full bg-slate-500/10 px-2 py-0.5 text-[10px] font-bold text-slate-500 border border-slate-500/20">
            Desactivado
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Llamadas" value={String(agent.callsInRange)} icon={Phone} />
        <Stat label="Horas" value={fmtHours(agent.hoursInRange)} icon={CalendarClock} />
        <Stat label="Llam./hora" value={agent.callsPerHour === null ? "—" : String(agent.callsPerHour)} icon={BarChart3} />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{agent.totalBusinesses} negocio(s) asignados</span>
        {agent.dueToday > 0 && <span className="font-medium text-amber-400">{agent.dueToday} toca llamar hoy</span>}
      </div>

      {agent.revenueInRange > 0 && (
        <div className="flex items-center justify-between rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs">
          <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
            <Banknote className="h-3.5 w-3.5" strokeWidth={2.25} />
            {agent.revenueInRange.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}
          </span>
          <span className="text-emerald-400/80">
            {agent.dealsInRange} venta{agent.dealsInRange !== 1 ? "s" : ""} cerrada{agent.dealsInRange !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {statusEntries.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-800/70 pt-3">
          {statusEntries.map(([status, count]) => (
            <span
              key={status}
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[status] ?? "bg-slate-500/10 text-slate-400 border border-slate-500/20"}`}
            >
              {STATUS_LABEL[status] ?? status} · {count}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-lg bg-slate-900/60 p-2.5 text-center">
      <Icon className="mx-auto mb-1 h-3 w-3 text-slate-600" strokeWidth={2.25} />
      <div className="font-mono text-sm font-semibold tabular-nums text-slate-100">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}

function EntryRow({
  entry,
  onUpdate,
  onDelete,
}: {
  entry: TimeEntryRow;
  onUpdate: (e: TimeEntryRow) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [clockIn, setClockIn] = useState(toLocalInputValue(entry.clockIn));
  const [clockOut, setClockOut] = useState(entry.clockOut ? toLocalInputValue(entry.clockOut) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Solo se calcula para fichajes ya cerrados — uno abierto no tiene una
  // duración estable que mostrar sin re-renderizar cada segundo.
  const durationH = entry.clockOut
    ? (new Date(entry.clockOut).getTime() - new Date(entry.clockIn).getTime()) / 3_600_000
    : null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/admin/time-entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clockIn: new Date(clockIn).toISOString(),
          clockOut: clockOut ? new Date(clockOut).toISOString() : "",
        }),
      });
      if (!res.ok) throw new Error(await errorMessageFrom(res));
      const updated = await res.json();
      onUpdate({ ...entry, ...updated });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function closeNow() {
    setBusy(true);
    try {
      const res = await queuedFetch(`/api/admin/time-entries/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clockOut: new Date().toISOString() }),
      });
      if (res.ok) onUpdate({ ...entry, ...(await res.json()) });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await queuedFetch(`/api/admin/time-entries/${entry.id}`, { method: "DELETE" });
      if (res.ok) onDelete(entry.id);
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-2.5">
        <span className="w-32 flex-shrink-0 truncate text-xs font-medium text-slate-300">{entry.user.name}</span>
        <input
          type="datetime-local"
          value={clockIn}
          onChange={(e) => setClockIn(e.target.value)}
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
        <span className="text-slate-600">→</span>
        <input
          type="datetime-local"
          value={clockOut}
          onChange={(e) => setClockOut(e.target.value)}
          placeholder="abierto"
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
        />
        <button onClick={save} disabled={busy} className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 disabled:opacity-50">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.5} /> : <Check className="h-3 w-3" strokeWidth={2.5} />}
          Guardar
        </button>
        <button onClick={() => setEditing(false)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300">
          <X className="h-3 w-3" strokeWidth={2.5} />
          Cancelar
        </button>
        {error && <span className="w-full text-[11px] text-red-400">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-32 flex-shrink-0 truncate text-xs font-medium text-slate-300">{entry.user.name}</span>
        <span className="font-mono text-xs text-slate-500 tabular-nums">
          {new Date(entry.clockIn).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
          {" → "}
          {entry.clockOut
            ? new Date(entry.clockOut).toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
            : "—"}
        </span>
        {!entry.clockOut && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/20">
            abierto
          </span>
        )}
        {entry.type !== "WORK" && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ENTRY_TYPE_BADGE[entry.type]}`}>
            {ENTRY_TYPE_LABEL[entry.type]}
          </span>
        )}
        <span className="font-mono text-[11px] text-slate-600 tabular-nums">
          {durationH === null ? "en curso" : fmtHours(durationH)}
        </span>
        {entry.editedByAdmin && entry.type === "WORK" && <span className="text-[10px] text-slate-600">editado</span>}
      </div>
      <div className="flex flex-shrink-0 items-center gap-3">
        {!entry.clockOut && (
          <button onClick={closeNow} disabled={busy} className="text-xs font-medium text-blue-400 hover:text-blue-300 disabled:opacity-50">
            Cerrar ahora
          </button>
        )}
        <button onClick={() => setEditing(true)} className="text-slate-500 hover:text-slate-300" title="Editar">
          <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
        <button onClick={remove} disabled={busy} className="text-slate-500 hover:text-red-400" title="Borrar">
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      </div>
    </div>
  );
}
