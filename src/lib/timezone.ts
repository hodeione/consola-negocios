/**
 * España opera en hora de Europe/Madrid, pero el runtime del servidor
 * (Vercel) va siempre en UTC. Un `new Date(); date.setHours(23, 59, 59, 999)`
 * fija esa hora en la zona LOCAL del proceso que lo ejecuta — en el servidor
 * eso es UTC, no Madrid. España va por delante de UTC (+1h en invierno/CET,
 * +2h en verano/CEST), así que "23:59:59.999 UTC" cae ya en la madrugada del
 * día siguiente en Madrid: durante esa 1-2h de cada noche, "toca llamar hoy"
 * (Modo llamada, el dashboard, el recordatorio diario) usaba el "hoy" de
 * ayer en vez del de hoy, y cualquier fecha calculada así se mostraba con un
 * día de diferencia según si el texto se formateaba en el servidor (UTC) o
 * en el navegador del agente (Madrid) — un desajuste de hidratación de React
 * real, no solo cosmético.
 *
 * Estas funciones fijan siempre Europe/Madrid explícitamente, sea cual sea
 * la zona horaria del proceso que las ejecute.
 */
const MADRID_TZ = "Europe/Madrid";

/** Desfase de Madrid respecto a UTC, en minutos, en el instante dado
 * (siempre positivo: Madrid va por delante — +60 en invierno, +120 en verano). */
function madridOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MADRID_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  // Intl con hour12:false puede devolver "24" para la medianoche.
  const hour = get("hour") % 24;
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"), instant.getUTCMilliseconds());
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Y-M-D de un instante, tal como se ve en hora de España (no en la del
 * runtime que ejecuta el código). */
export function madridDayKey(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MADRID_TZ }).format(instant);
}

function dayBoundary(ymd: string, hh: number, mm: number, ss: number, ms: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // Primero se calcula como si esa hora fuera UTC, y se corrige con el
  // desfase real de Madrid en ese instante — así funciona igual a ambos
  // lados del cambio de hora de verano sin tener que tratarlo a mano.
  const utcGuess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss, ms));
  const offsetMin = madridOffsetMinutes(utcGuess);
  return new Date(utcGuess.getTime() - offsetMin * 60_000);
}

/** Instante UTC de las 00:00:00.000 de `ymd` (YYYY-MM-DD) en hora de España. */
export function startOfDayMadrid(ymd: string): Date {
  return dayBoundary(ymd, 0, 0, 0, 0);
}

/** Instante UTC de las 23:59:59.999 de `ymd` (YYYY-MM-DD) en hora de España. */
export function endOfDayMadrid(ymd: string): Date {
  return dayBoundary(ymd, 23, 59, 59, 999);
}

/** Instante UTC de las 00:00:00.000 de hoy en hora de España. */
export function startOfTodayMadrid(): Date {
  return startOfDayMadrid(madridDayKey(new Date()));
}

/** Instante UTC de las 23:59:59.999 de hoy en hora de España. */
export function endOfTodayMadrid(): Date {
  return endOfDayMadrid(madridDayKey(new Date()));
}

/** `ymd` (YYYY-MM-DD) menos `days` días — aritmética de calendario pura,
 * sin zona horaria de por medio (opera solo sobre el trío año/mes/día). */
export function ymdMinusDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().slice(0, 10);
}
