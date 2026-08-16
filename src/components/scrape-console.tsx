"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2, FileSpreadsheet, Loader2, Pause, Play, Radar, Search, Tags, Upload, X } from "lucide-react";
import type { BatchJob, ScrapeTask } from "@/generated/prisma/client";
import { queuedFetch } from "@/lib/fetch-queue";

type BatchJobWithTasks = BatchJob & { tasks: ScrapeTask[] };

const TERMINAL = new Set(["DONE", "ERROR", "CANCELLED"]);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  COLLECTING: "Buscando en Maps",
  DETAILING: "Leyendo fichas",
  ENRICHING: "Extrayendo contacto",
  DONE: "Completado",
  ERROR: "Error",
  CANCELLED: "Cancelado",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-slate-500/10 text-slate-300 border border-slate-500/20",
  COLLECTING: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  DETAILING: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  ENRICHING: "bg-blue-500/10 text-blue-300 border border-blue-500/20",
  DONE: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20",
  ERROR: "bg-red-500/10 text-red-300 border border-red-500/20",
  CANCELLED: "bg-slate-500/10 text-slate-400 border border-slate-500/20",
};

const STAGE_INDEX: Record<string, number> = {
  PENDING: 0,
  COLLECTING: 1,
  DETAILING: 2,
  ENRICHING: 3,
  DONE: 4,
  CANCELLED: 4,
  ERROR: 4,
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function errorMessageFrom(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export function ScrapeConsole({ initialBatchJobs }: { initialBatchJobs: BatchJobWithTasks[] }) {
  const [batchJobs, setBatchJobs] = useState(initialBatchJobs);
  const [zonesText, setZonesText] = useState("");
  const [keywordsText, setKeywordsText] = useState("");
  const [maxResults, setMaxResults] = useState(60);
  const [language, setLanguage] = useState("es");
  const [running, setRunning] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchJobsRef = useRef(batchJobs);
  useEffect(() => {
    batchJobsRef.current = batchJobs;
  }, [batchJobs]);

  function patchTask(updated: ScrapeTask) {
    setBatchJobs((prev) =>
      prev.map((b) =>
        b.id === updated.batchJobId
          ? { ...b, tasks: b.tasks.map((t) => (t.id === updated.id ? updated : t)) }
          : b
      )
    );
  }

  // Bucle: mientras `running`, va tomando la siguiente tarea no terminada de
  // cualquier lote y la avanza paso a paso hasta que termina, una tras otra.
  // Reanuda automáticamente cualquier tarea que quedara a medias (p.ej. si
  // se cerró la pestaña con la búsqueda en marcha).
  useEffect(() => {
    if (!running) return;
    let stopped = false;

    let consecutiveFailures = 0;

    async function loop() {
      while (!stopped) {
        const allTasks = batchJobsRef.current.flatMap((b) => b.tasks);
        const next = allTasks.find((t) => !TERMINAL.has(t.status));
        if (!next) {
          await sleep(1500);
          continue;
        }
        try {
          const res = await queuedFetch(`/api/scrape-tasks/${next.id}/step`, { method: "POST" });
          if (!res.ok) throw new Error(await errorMessageFrom(res));
          const task: ScrapeTask = await res.json();
          if (stopped) return;
          consecutiveFailures = 0;
          setError(null);
          patchTask(task);
        } catch (e) {
          if (stopped) return;
          consecutiveFailures++;
          // Un fallo puntual (p.ej. sesión rotando de fondo) no debe tumbar
          // la tarea — sólo avisamos si falla varias veces seguidas.
          if (consecutiveFailures >= 4) {
            setError(e instanceof Error ? e.message : String(e));
          }
          await sleep(Math.min(1000 * consecutiveFailures, 5000));
          continue;
        }
        await sleep(200);
      }
    }

    loop();
    return () => {
      stopped = true;
    };
  }, [running]);

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const zones = zonesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const keywords = keywordsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    if (zones.length === 0) {
      setError("Añade al menos una zona (una por línea)");
      return;
    }

    setSubmitting(true);
    try {
      const res = await queuedFetch("/api/batch-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones, keywords, maxResultsPerCombo: maxResults, language }),
      });
      if (!res.ok) throw new Error(await errorMessageFrom(res));
      const created: BatchJobWithTasks = await res.json();
      setBatchJobs((prev) => [created, ...prev]);
      setZonesText("");
      setKeywordsText("");
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(taskId: string) {
    const res = await queuedFetch(`/api/scrape-tasks/${taskId}/cancel`, { method: "POST" });
    if (res.ok) patchTask(await res.json());
  }

  const activeCount = batchJobs
    .flatMap((b) => b.tasks)
    .filter((t) => !TERMINAL.has(t.status)).length;

  return (
    <div className="flex h-full">
      {/* ── Formulario de lote ─────────────────────────── */}
      <aside className="flex w-96 flex-shrink-0 flex-col gap-5 overflow-y-auto border-r border-slate-800/80 bg-slate-950/60 p-5">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
              <Radar className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <h1 className="text-sm font-semibold text-slate-100">Búsqueda por lotes</h1>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Una zona por línea. Combina con cada tipo de negocio (opcional, una
            por línea) — se lanza una tarea por cada combinación.
          </p>
        </div>

        <form onSubmit={handleCreateBatch} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Zonas / ciudades <span className="text-red-400">*</span>
            </label>
            <textarea
              value={zonesText}
              onChange={(e) => setZonesText(e.target.value)}
              rows={4}
              placeholder={"Madrid España\nBilbao España\nValencia España"}
              className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Tipos de negocio <span className="text-slate-600">(opcional — vacío = todos)</span>
            </label>
            <textarea
              value={keywordsText}
              onChange={(e) => setKeywordsText(e.target.value)}
              rows={4}
              placeholder={"fontanero\ndentista\npeluquería"}
              className="w-full resize-y rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Resultados por zona
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value) || 60)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Idioma</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="es">Español</option>
                <option value="en">English</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="pt">Português</option>
                <option value="it">Italiano</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <Search className="h-4 w-4" strokeWidth={2.5} />}
            {submitting ? "Creando…" : "Lanzar búsqueda"}
          </button>
        </form>

        <ImportExcelPanel />

        <div className="surface mt-auto flex items-center justify-between px-3 py-2.5">
          <div className="text-xs text-slate-400">
            {activeCount > 0 ? `${activeCount} tarea(s) en cola/curso` : "Sin tareas pendientes"}
          </div>
          <button
            onClick={() => setRunning((r) => !r)}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
              running
                ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                : "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25"
            }`}
          >
            {running ? <Pause className="h-3 w-3" strokeWidth={2.5} /> : <Play className="h-3 w-3" strokeWidth={2.5} />}
            {running ? "Pausar" : "Reanudar"}
          </button>
        </div>
      </aside>

      {/* ── Lotes y tareas ─────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        {batchJobs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-slate-600">
              <Radar className="h-5 w-5" strokeWidth={1.5} />
            </span>
            <p className="text-sm">Todavía no has lanzado ninguna búsqueda.</p>
            <p className="text-xs text-slate-600">Rellena el formulario de la izquierda para empezar.</p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {batchJobs.map((batch) => (
              <div key={batch.id} className="surface overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-800/70 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Tags className="h-3.5 w-3.5 text-slate-600" strokeWidth={2} />
                    {batch.zones.length} zona(s) × {batch.keywords.filter(Boolean).length || 1} tipo(s) ·{" "}
                    {new Date(batch.createdAt).toLocaleString("es-ES")}
                  </div>
                  <Link
                    href="/businesses"
                    prefetch={false}
                    className="flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300"
                  >
                    Ver negocios <ArrowUpRight className="h-3 w-3" strokeWidth={2.5} />
                  </Link>
                </div>
                <div className="divide-y divide-slate-800/70">
                  {batch.tasks.map((task) => (
                    <TaskRow key={task.id} task={task} onCancel={() => handleCancel(task.id)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({ task, onCancel }: { task: ScrapeTask; onCancel: () => void }) {
  const stageIdx = STAGE_INDEX[task.status] ?? 0;
  const pct = (stageIdx / 4) * 100;
  const isActive = !TERMINAL.has(task.status);

  return (
    <div className="px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-200">
            {task.keyword || "(todos)"} — {task.zone}
          </div>
          <div className="truncate text-xs text-slate-500">{task.message}</div>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[task.status]}`}>
          {STATUS_LABEL[task.status] ?? task.status}
        </span>
        {isActive && (
          <button
            onClick={onCancel}
            className="flex flex-shrink-0 items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400"
          >
            <X className="h-3 w-3" strokeWidth={2.5} />
            Detener
          </button>
        )}
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full bg-blue-500 transition-all duration-500 ${
            isActive ? "animate-pulse" : ""
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-600">
        <span>{task.totalCount} lugares</span>
        <span className="text-emerald-500">{task.foundCount} con contacto</span>
      </div>
    </div>
  );
}

function ImportExcelPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; errorCount: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await queuedFetch("/api/businesses/import", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);
      setResult(data);
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <FileSpreadsheet className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
        <h2 className="text-sm font-semibold text-slate-100">Importar Excel</h2>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Sube un .xlsx generado con el scraper local (mismas columnas que &quot;Exportar
        Excel&quot;) — se guardan los negocios con contacto, sin duplicar los que ya
        tengas.
      </p>
      <form onSubmit={handleUpload} className="flex flex-col gap-2">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-xs file:text-slate-300"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 disabled:opacity-40"
        >
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Upload className="h-3.5 w-3.5" strokeWidth={2.25} />}
          {uploading ? "Importando…" : "Importar"}
        </button>
      </form>
      {error && (
        <div className="mt-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.25} />
          <span>
            {result.imported} negocio(s) importados, {result.skipped} fila(s) omitidas
            {result.errorCount > 0 && `, ${result.errorCount} con error`}.
          </span>
        </div>
      )}
    </div>
  );
}
