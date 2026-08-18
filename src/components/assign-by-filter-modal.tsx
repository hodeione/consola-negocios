"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Users, X } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";

type SimpleUser = { id: string; name: string };

export function AssignByFilterModal({
  queryString,
  matchingCount,
  assignableUsers,
  onClose,
  onAssigned,
}: {
  queryString: string;
  matchingCount: number;
  assignableUsers: SimpleUser[];
  onClose: () => void;
  onAssigned: (count: number) => void;
}) {
  const [userId, setUserId] = useState("");
  const [limit, setLimit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const limitNum = limit.trim() ? Math.max(1, Math.min(matchingCount, Number(limit))) : matchingCount;

  async function handleAssign() {
    if (!userId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await queuedFetch(`/api/businesses/bulk-by-filter?${queryString}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToUserId: userId, ...(limit.trim() && { limit: Number(limit) }) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      onAssigned(data.updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="surface-solid relative flex w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" strokeWidth={2.25} />
            <h2 className="text-sm font-semibold text-slate-100">Asignar por filtro</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 transition hover:bg-slate-900 hover:text-slate-200">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Coinciden <span className="font-semibold text-slate-300">{matchingCount}</span> negocio(s) con los filtros
            activos. Se reasignan todos (o el número que pongas abajo) sin tener que marcarlos uno a uno.
          </p>

          <label className="mb-1 block text-xs font-medium text-slate-400">Asignar a</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="mb-3 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="" disabled>
              Elige un agente…
            </option>
            {assignableUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-xs font-medium text-slate-400">
            Cuántos <span className="text-slate-600">(opcional — vacío = los {matchingCount})</span>
          </label>
          <input
            type="number"
            min={1}
            max={matchingCount}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            placeholder={String(matchingCount)}
            className="mb-4 w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
          />

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={handleAssign}
            disabled={!userId || busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} />}
            {busy ? "Asignando…" : `Asignar ${limitNum} negocio(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
