"use client";

import { useState } from "react";
import { CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";

export function ImportExcelModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
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
      if (data.imported > 0) onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className="surface-solid relative flex w-full max-w-md flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-800/80 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-slate-500" strokeWidth={2.25} />
            <h2 className="text-sm font-semibold text-slate-100">Importar Excel</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-500 transition hover:bg-slate-900 hover:text-slate-200">
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
        <div className="p-5">
          <p className="mb-4 text-xs leading-relaxed text-slate-500">
            Sube un .xlsx con las mismas columnas que &quot;Exportar Excel&quot; — se guardan los
            negocios con algún dato de contacto, sin duplicar los que ya tengas.
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
              className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-40"
            >
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} /> : <Upload className="h-3.5 w-3.5" strokeWidth={2.25} />}
              {uploading ? "Importando…" : "Importar"}
            </button>
          </form>
          {error && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          {result && (
            <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" strokeWidth={2.25} />
              <span>
                {result.imported} negocio(s) importados, {result.skipped} fila(s) omitidas
                {result.errorCount > 0 && `, ${result.errorCount} con error`}.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
