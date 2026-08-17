"use client";

import { useEffect, useState } from "react";
import { Copy, Loader2, X } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";
import { STATUS_BADGE, STATUS_LABEL } from "@/lib/businesses/labels";

interface DuplicateBusiness {
  id: string;
  name: string;
  zone: string;
  address: string;
  mapsPhone: string;
  status: string;
  assignedTo: { id: string; name: string } | null;
}
interface DuplicateGroup {
  key: string;
  businesses: DuplicateBusiness[];
}

export function DuplicatesModal({ onClose, onOpenBusiness }: { onClose: () => void; onOpenBusiness: (id: string) => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    queuedFetch("/api/businesses/duplicates")
      .then((r) => r.json())
      .then((data) => !cancelled && setGroups(data.groups))
      .catch(() => !cancelled && setGroups([]));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="surface-solid relative flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Copy className="h-4 w-4 text-slate-500" strokeWidth={2.25} />
            <h2 className="text-sm font-semibold text-slate-100">
              Posibles duplicados {groups && groups.length > 0 && `(${groups.length})`}
            </h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 transition hover:bg-slate-900 hover:text-slate-200">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
        <div className="overflow-y-auto p-5">
          <p className="mb-4 text-xs text-slate-500">
            Mismo nombre (ignorando mayúsculas, acentos, puntuación y formas societarias como S.L.) en la misma zona.
            No se fusionan solos — revisa cada grupo y decide (reasignar, marcar uno como incorrecto, dejarlo si en
            realidad son dos negocios distintos).
          </p>
          {groups === null ? (
            <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} />
              Buscando…
            </div>
          ) : groups.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-600">No se han encontrado posibles duplicados. 🎉</p>
          ) : (
            <div className="flex flex-col gap-3">
              {groups.map((g) => (
                <div key={g.key} className="surface p-3">
                  {g.businesses.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => onOpenBusiness(b.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-slate-800/50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-200">{b.name}</div>
                        <div className="truncate text-xs text-slate-500">
                          {b.zone} {b.address && `· ${b.address}`} {b.mapsPhone && `· ${b.mapsPhone}`}
                        </div>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        {b.assignedTo && <span className="text-[10px] text-slate-600">{b.assignedTo.name}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[b.status] ?? ""}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
