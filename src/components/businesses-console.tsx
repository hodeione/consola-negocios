"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Mail,
  Phone,
  Search,
  ShieldAlert,
  Upload,
  Users,
  X,
} from "lucide-react";
import type { Business } from "@/generated/prisma/client";
import { queuedFetch } from "@/lib/fetch-queue";
import {
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  PRIORITY_OPTIONS,
  STATUS_BADGE,
  STATUS_LABEL,
  STATUS_OPTIONS,
} from "@/lib/businesses/labels";
import { BusinessDrawer } from "@/components/business-drawer";
import { useToast } from "@/components/toast-provider";
import { DuplicatesModal } from "@/components/duplicates-modal";
import { ImportExcelModal } from "@/components/import-excel-modal";
import { AssignByFilterModal } from "@/components/assign-by-filter-modal";
import { DigitalNeedBadge } from "@/components/digital-need-badge";

type AssignedTo = { id: string; name: string } | null;
export type BusinessRow = Business & { assignedTo: AssignedTo };
type SimpleUser = { id: string; name: string };

interface Filters {
  search: string;
  status: string[];
  priority: string[];
  zone: string;
  keyword: string;
  tag: string;
  assignedTo: string; // "" | "me" | "unassigned" | userId
  dueOnly: boolean;
  staleOnly: boolean;
  forgottenOnly: boolean;
  maxRating: string; // "" | "3" | "3.5" | "4" — string para encajar en <select>
  minDigitalNeed: string; // "" | "40" | "70" — string para encajar en <select>
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: [],
  priority: [],
  zone: "",
  keyword: "",
  tag: "",
  assignedTo: "",
  dueOnly: false,
  staleOnly: false,
  forgottenOnly: false,
  maxRating: "",
  minDigitalNeed: "",
};

const STALE_DAYS = 90;

function buildQuery(filters: Filters, page: number, pageSize: number, sortBy: string, sortDir: string) {
  const sp = new URLSearchParams();
  if (filters.search) sp.set("search", filters.search);
  if (filters.status.length) sp.set("status", filters.status.join(","));
  if (filters.priority.length) sp.set("priority", filters.priority.join(","));
  if (filters.zone) sp.set("zone", filters.zone);
  if (filters.keyword) sp.set("keyword", filters.keyword);
  if (filters.tag) sp.set("tag", filters.tag);
  if (filters.assignedTo) sp.set("assignedTo", filters.assignedTo);
  if (filters.dueOnly) sp.set("dueBefore", new Date().toISOString());
  if (filters.staleOnly) {
    const d = new Date();
    d.setDate(d.getDate() - STALE_DAYS);
    sp.set("staleBefore", d.toISOString());
  }
  if (filters.forgottenOnly) sp.set("forgottenOnly", "true");
  if (filters.maxRating) sp.set("maxRating", filters.maxRating);
  if (filters.minDigitalNeed) sp.set("minDigitalNeed", filters.minDigitalNeed);
  sp.set("page", String(page));
  sp.set("pageSize", String(pageSize));
  sp.set("sortBy", sortBy);
  sp.set("sortDir", sortDir);
  return sp.toString();
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function BusinessesConsole({
  initialItems,
  initialTotal,
  initialStats,
  pageSize,
  isAdmin,
  assignableUsers,
}: {
  initialItems: BusinessRow[];
  initialTotal: number;
  initialStats: { total: number; byStatus: Record<string, number>; keywords: string[] };
  pageSize: number;
  isAdmin: boolean;
  assignableUsers: SimpleUser[];
}) {
  const [items, setItems] = useState<BusinessRow[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [stats, setStats] = useState(initialStats);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const showToast = useToast();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showAssignByFilter, setShowAssignByFilter] = useState(false);

  const firstLoad = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQuery(filters, page, pageSize, sortBy, sortDir);
      const [listRes, statsRes] = await Promise.all([
        queuedFetch(`/api/businesses?${qs}`),
        queuedFetch("/api/businesses/stats"),
      ]);
      if (!listRes.ok) throw new Error(`Error ${listRes.status} cargando negocios`);
      const data = await listRes.json();
      setItems(data.items);
      setTotal(data.total);
      if (statsRes.ok) setStats(await statsRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, sortBy, sortDir]);

  // Evita el fetch duplicado en el primer render (ya tenemos datos del servidor).
  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    refresh();
  }, [refresh]);

  // Debounce del texto de búsqueda.
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setFilters((f) => ({ ...f, search: searchInput }));
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setPage(1);
    setFilters((f) => ({ ...f, [key]: value }));
  }

  function toggleMulti(key: "status" | "priority", value: string) {
    setPage(1);
    setFilters((f) => {
      const current = f[key];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...f, [key]: next };
    });
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }

  function toggleSort(col: string) {
    if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(col);
      setSortDir("desc");
    }
  }

  async function bulkAction(patch: { status?: string; priority?: string; addTag?: string; assignedToUserId?: string | null }) {
    if (selected.size === 0) return;
    const count = selected.size;
    setBulkBusy(true);
    try {
      const res = await queuedFetch("/api/businesses/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], ...patch }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Error en acción en lote");
      setSelected(new Set());
      await refresh();
      showToast(`${count} negocio(s) actualizados`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  }

  function exportCurrentView() {
    const qs = buildQuery(filters, 1, 5000, sortBy, sortDir);
    window.open(`/api/businesses/export?${qs}`, "_blank");
  }

  function handleBusinessUpdated(updated: BusinessRow) {
    setItems((prev) => prev.map((b) => (b.id === updated.id ? { ...b, ...updated } : b)));
    queuedFetch("/api/businesses/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => s && setStats(s));
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasActiveFilters =
    filters.status.length > 0 ||
    filters.priority.length > 0 ||
    filters.zone ||
    filters.keyword ||
    filters.tag ||
    filters.assignedTo ||
    filters.dueOnly ||
    filters.staleOnly ||
    filters.forgottenOnly ||
    filters.maxRating ||
    filters.minDigitalNeed ||
    searchInput;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Tira de stats ──────────────────────────── */}
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-slate-800/80 bg-slate-950/60 px-6 py-3.5">
        <StatPill label="Total" value={stats.total} icon={Building2} tone="blue" />
        <StatPill label="Interesados" value={stats.byStatus.INTERESTED ?? 0} icon={Phone} tone="emerald" />
        <StatPill label="Clientes" value={stats.byStatus.CUSTOMER ?? 0} tone="purple" />
        <StatPill label="Pendientes" value={stats.byStatus.PENDING ?? 0} tone="slate" />
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => {
              setPage(1);
              setFilters((f) => ({ ...f, dueOnly: !f.dueOnly }));
            }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filters.dueOnly
                ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                : "border border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={2.25} />
            Toca llamar hoy
          </button>
          <button
            onClick={() => {
              setPage(1);
              setFilters((f) => ({ ...f, staleOnly: !f.staleOnly }));
            }}
            title={`Negocios sin verificar en más de ${STALE_DAYS} días`}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filters.staleOnly
                ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                : "border border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.25} />
            Desactualizados
          </button>
          <button
            onClick={() => {
              setPage(1);
              setFilters((f) => ({ ...f, forgottenOnly: !f.forgottenOnly }));
            }}
            title="En el pipeline (no cerrados) desde hace tiempo y sin llamadas en 30 días"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filters.forgottenOnly
                ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30"
                : "border border-slate-800 text-slate-300 hover:border-slate-700"
            }`}
          >
            <Clock3 className="h-3.5 w-3.5" strokeWidth={2.25} />
            Olvidados
          </button>
          <button
            onClick={() => setShowDuplicates(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700"
          >
            <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
            Duplicados
          </button>
          <button
            onClick={exportCurrentView}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={2.25} />
            Exportar Excel
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-slate-700"
          >
            <Upload className="h-3.5 w-3.5" strokeWidth={2.25} />
            Importar Excel
          </button>
        </div>
      </div>

      {/* ── Filtros ────────────────────────────────── */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-slate-800/80 bg-slate-950/40 px-6 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" strokeWidth={2} />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre, dirección, web, contacto…"
            className="w-64 rounded-lg border border-slate-800 bg-slate-900/70 py-1.5 pl-8 pr-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
          />
        </div>
        <input
          value={filters.zone}
          onChange={(e) => updateFilter("zone", e.target.value)}
          placeholder="Zona"
          className="w-36 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
        />
        <select
          value={filters.keyword}
          onChange={(e) => updateFilter("keyword", e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
        >
          <option value="">Tipo de negocio: cualquiera</option>
          {stats.keywords.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          value={filters.tag}
          onChange={(e) => updateFilter("tag", e.target.value)}
          placeholder="Etiqueta"
          className="w-28 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
        />
        <select
          value={filters.maxRating}
          onChange={(e) => updateFilter("maxRating", e.target.value)}
          title="Solo negocios con rating por debajo de este umbral (más necesitados de mejorar su presencia online)"
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
        >
          <option value="">Rating: cualquiera</option>
          <option value="3">≤ 3★</option>
          <option value="3.5">≤ 3.5★</option>
          <option value="4">≤ 4★</option>
        </select>
        <select
          value={filters.minDigitalNeed}
          onChange={(e) => updateFilter("minDigitalNeed", e.target.value)}
          title="Sin web, web caída, sin SSL, no responsive o web que en realidad es solo un enlace a redes sociales"
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
        >
          <option value="">Necesidad digital: cualquiera</option>
          <option value="40">Alta (≥40) — sin web o web = red social</option>
          <option value="1">Cualquier señal detectada</option>
        </select>

        <div className="flex gap-1">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => toggleMulti("status", s)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                filters.status.includes(s) ? STATUS_BADGE[s] : "bg-slate-900/60 text-slate-500 border border-slate-800"
              }`}
              title={STATUS_LABEL[s]}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        <div className="flex gap-1">
          {PRIORITY_OPTIONS.map((p) => (
            <button
              key={p}
              onClick={() => toggleMulti("priority", p)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                filters.priority.includes(p) ? PRIORITY_BADGE[p] : "bg-slate-900/60 text-slate-500 border border-slate-800"
              }`}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>

        {isAdmin && (
          <select
            value={filters.assignedTo}
            onChange={(e) => updateFilter("assignedTo", e.target.value)}
            className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="">Todos los agentes</option>
            <option value="unassigned">Sin asignar</option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}

        {hasActiveFilters && isAdmin && (
          <button
            onClick={() => setShowAssignByFilter(true)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-3 py-1.5 text-xs font-semibold text-blue-300 transition hover:bg-blue-500/20"
          >
            <Users className="h-3.5 w-3.5" strokeWidth={2.25} />
            Asignar por filtro ({total})
          </button>
        )}

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
            className="flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-300"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
            Limpiar filtros
          </button>
        )}

        {loading && <span className="text-xs text-slate-600">Cargando…</span>}
      </div>

      {error && (
        <div className="flex-shrink-0 border-b border-red-500/20 bg-red-500/10 px-6 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* ── Barra de acciones en lote ──────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-blue-500/20 bg-blue-500/[0.07] px-6 py-2.5">
          <span className="text-xs font-medium text-blue-200">{selected.size} seleccionados</span>
          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => e.target.value && bulkAction({ status: e.target.value })}
            className="rounded-md border border-blue-500/30 bg-slate-900 px-2 py-1 text-xs text-slate-100"
          >
            <option value="" disabled>
              Cambiar estado…
            </option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => e.target.value && bulkAction({ priority: e.target.value })}
            className="rounded-md border border-blue-500/30 bg-slate-900 px-2 py-1 text-xs text-slate-100"
          >
            <option value="" disabled>
              Cambiar prioridad…
            </option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <BulkTagInput disabled={bulkBusy} onSubmit={(tag) => bulkAction({ addTag: tag })} />
          {isAdmin && (
            <select
              disabled={bulkBusy}
              defaultValue=""
              onChange={(e) => e.target.value && bulkAction({ assignedToUserId: e.target.value })}
              className="rounded-md border border-blue-500/30 bg-slate-900 px-2 py-1 text-xs text-slate-100"
            >
              <option value="" disabled>
                Asignar a…
              </option>
              {assignableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto text-xs font-medium text-blue-300 hover:text-blue-100"
          >
            Deseleccionar
          </button>
        </div>
      )}

      {/* ── Tabla ──────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 && !loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-600">
              <Building2 className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <p className="text-sm">No hay negocios que coincidan con los filtros.</p>
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm">
              <tr className="border-b border-slate-800/80 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
                <th className="w-8 px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === items.length}
                    onChange={toggleSelectAll}
                    className="accent-blue-600"
                  />
                </th>
                <SortableTh label="Nombre" col="name" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Zona" col="zone" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <th className="px-3 py-2.5">Contacto</th>
                <SortableTh label="Estado" col="status" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Prioridad" col="priority" sortBy={sortBy} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh
                  label="Próx. llamada"
                  col="nextFollowUpAt"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                <SortableTh
                  label="Necesidad"
                  col="digitalNeedScore"
                  sortBy={sortBy}
                  sortDir={sortDir}
                  onClick={toggleSort}
                />
                {isAdmin && <th className="px-3 py-2.5">Asignado</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setOpenId(b.id)}
                  className="cursor-pointer border-b border-slate-900 transition hover:bg-slate-900/50"
                >
                  <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(b.id)}
                      onChange={() => toggleSelect(b.id)}
                      className="accent-blue-600"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-slate-100">{b.name}</div>
                    <div className="text-xs text-slate-500">{b.category || b.keyword}</div>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{b.zone}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {b.mapsPhone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 text-slate-600" strokeWidth={2} />
                        {b.mapsPhone}
                      </div>
                    )}
                    {b.emails[0] && (
                      <div className="mt-0.5 flex max-w-[180px] items-center gap-1.5 truncate">
                        <Mail className="h-3 w-3 flex-shrink-0 text-slate-600" strokeWidth={2} />
                        <span className="truncate">{b.emails[0]}</span>
                      </div>
                    )}
                    {!b.mapsPhone && !b.emails[0] && <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE[b.status]}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_BADGE[b.priority]}`}>
                      {PRIORITY_LABEL[b.priority]}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-400">
                    {b.nextFollowUpAt ? new Date(b.nextFollowUpAt).toLocaleDateString("es-ES") : "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    <DigitalNeedBadge score={b.digitalNeedScore} signals={b.digitalNeedSignals} />
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2.5">
                      {b.assignedTo ? (
                        <div className="flex items-center gap-1.5">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[9px] font-semibold text-slate-300">
                            {initials(b.assignedTo.name)}
                          </span>
                          <span className="text-xs text-slate-400">{b.assignedTo.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-600">—</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Paginación ─────────────────────────────── */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-slate-800/80 bg-slate-950/60 px-6 py-2.5 text-xs text-slate-400">
        <span>{total} negocios</span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 transition hover:border-slate-700 disabled:opacity-30"
          >
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="flex items-center gap-1 rounded-md border border-slate-800 px-2 py-1 transition hover:border-slate-700 disabled:opacity-30"
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      </div>

      {openId && (
        <BusinessDrawer
          key={openId}
          businessId={openId}
          isAdmin={isAdmin}
          assignableUsers={assignableUsers}
          onClose={() => setOpenId(null)}
          onUpdated={handleBusinessUpdated}
        />
      )}

      {showDuplicates && (
        <DuplicatesModal
          onClose={() => setShowDuplicates(false)}
          onOpenBusiness={(id) => {
            setShowDuplicates(false);
            setOpenId(id);
          }}
        />
      )}

      {showImport && (
        <ImportExcelModal
          onClose={() => setShowImport(false)}
          onImported={() => {
            refresh();
            showToast("Negocios importados");
          }}
        />
      )}

      {showAssignByFilter && (
        <AssignByFilterModal
          queryString={buildQuery(filters, 1, pageSize, sortBy, sortDir)}
          matchingCount={total}
          assignableUsers={assignableUsers}
          onClose={() => setShowAssignByFilter(false)}
          onAssigned={(count) => {
            setShowAssignByFilter(false);
            refresh();
            showToast(`${count} negocio(s) asignados`);
          }}
        />
      )}
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "blue",
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: string;
  icon?: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const toneClass: Record<string, string> = {
    blue: "text-blue-300",
    emerald: "text-emerald-300",
    purple: "text-purple-300",
    slate: "text-slate-300",
  };
  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-800/80 bg-slate-900/50 px-3 py-1.5">
      {Icon && <Icon className={`h-3.5 w-3.5 ${toneClass[tone]}`} strokeWidth={2.25} />}
      <div>
        <span className={`text-sm font-bold ${toneClass[tone]}`}>{value}</span>
        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortBy,
  sortDir,
  onClick,
}: {
  label: string;
  col: string;
  sortBy: string;
  sortDir: string;
  onClick: (col: string) => void;
}) {
  const active = sortBy === col;
  return (
    <th
      onClick={() => onClick(col)}
      className={`cursor-pointer select-none px-3 py-2.5 transition hover:text-slate-300 ${active ? "text-slate-200" : ""}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (sortDir === "asc" ? <ArrowUp className="h-3 w-3" strokeWidth={2.5} /> : <ArrowDown className="h-3 w-3" strokeWidth={2.5} />)}
      </span>
    </th>
  );
}

function BulkTagInput({ disabled, onSubmit }: { disabled: boolean; onSubmit: (tag: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        onSubmit(value.trim());
        setValue("");
      }}
      className="flex items-center gap-1"
    >
      <input
        disabled={disabled}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="+ etiqueta"
        className="w-24 rounded-md border border-blue-500/30 bg-slate-900 px-2 py-1 text-xs text-slate-100 outline-none"
      />
    </form>
  );
}
