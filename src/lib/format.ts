/** "Xh Ym Zs" a partir de minutos (con fracción) — precisión de segundo.
 * Compartido entre componentes de servidor y de cliente (por eso vive aparte
 * de stats-charts.tsx, que es "use client"). */
export function fmtHMS(totalMinutes: number): string {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (h > 0 || m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(" ");
}
