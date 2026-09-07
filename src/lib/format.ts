// Toda fecha/hora que se le enseña a alguien se formatea siempre en hora de
// España, nunca en la del proceso que ejecuta el código — si no, el mismo
// Date se ve con un día (u hora) de diferencia según si lo formatea el
// servidor (Vercel corre en UTC) o el navegador del agente (Madrid), y en
// componentes de cliente eso rompe la hidratación de React (ver
// src/lib/timezone.ts para el porqué completo).
const MADRID_TZ = "Europe/Madrid";

/** Fecha corta en hora de España, p.ej. "7/9/2026". */
export function fmtDateEs(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleDateString("es-ES", { timeZone: MADRID_TZ, ...opts });
}

/** Fecha + hora en hora de España, p.ej. "7/9/2026, 14:30". */
export function fmtDateTimeEs(date: Date | string, opts?: Intl.DateTimeFormatOptions): string {
  return new Date(date).toLocaleString("es-ES", { timeZone: MADRID_TZ, ...opts });
}

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
