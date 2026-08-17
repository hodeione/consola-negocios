import { prisma } from "@/lib/prisma";
import type { CallStatus } from "@/generated/prisma/enums";

export interface AgentStats {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  callsInRange: number;
  hoursInRange: number;
  callsPerHour: number | null;
  totalBusinesses: number;
  byStatus: Record<string, number>;
  dueToday: number;
  revenueInRange: number;
  dealsInRange: number;
}

/**
 * Estadísticas por agente: llamadas realizadas y horas fichadas en
 * [from, to], más una foto actual de su cartera (negocios por estado).
 * Compartido entre la página /admin/stats (SSR) y GET /api/admin/stats
 * (refrescos desde el cliente al cambiar el rango).
 */
export async function getAgentStats(from: Date, to: Date): Promise<AgentStats[]> {
  const now = new Date();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, active: true },
  });
  const userIds = users.map((u) => u.id);

  const [callsRaw, businessesByStatusRaw, dueTodayRaw, entriesOverlapping, revenueRaw] = await Promise.all([
    prisma.callActivity.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    prisma.business.groupBy({
      by: ["assignedToUserId", "status"],
      where: { assignedToUserId: { in: userIds } },
      _count: { _all: true },
    }),
    prisma.business.groupBy({
      by: ["assignedToUserId"],
      where: { assignedToUserId: { in: userIds }, nextFollowUpAt: { lte: endOfToday } },
      _count: { _all: true },
    }),
    // Cualquier fichaje que se solape con el rango: empezó antes de `to` y
    // (sigue abierto, o terminó después de `from`).
    prisma.timeEntry.findMany({
      where: {
        userId: { in: userIds },
        clockIn: { lte: to },
        OR: [{ clockOut: null }, { clockOut: { gte: from } }],
      },
      select: { userId: true, clockIn: true, clockOut: true },
    }),
    // Ventas cerradas en el rango (closedAt dentro de [from, to]).
    prisma.business.groupBy({
      by: ["assignedToUserId"],
      where: { assignedToUserId: { in: userIds }, closedAt: { gte: from, lte: to } },
      _sum: { dealValue: true },
      _count: { _all: true },
    }),
  ]);

  const callsByUser = new Map(callsRaw.map((r) => [r.userId, r._count._all]));
  const dueTodayByUser = new Map(dueTodayRaw.map((r) => [r.assignedToUserId ?? "", r._count._all]));
  const revenueByUser = new Map(revenueRaw.map((r) => [r.assignedToUserId ?? "", r._sum.dealValue ?? 0]));
  const dealsByUser = new Map(revenueRaw.map((r) => [r.assignedToUserId ?? "", r._count._all]));

  const statusByUser = new Map<string, Record<string, number>>();
  for (const row of businessesByStatusRaw) {
    const key = row.assignedToUserId ?? "";
    const bucket = statusByUser.get(key) ?? {};
    bucket[row.status as CallStatus] = row._count._all;
    statusByUser.set(key, bucket);
  }

  const hoursByUser = new Map<string, number>();
  for (const entry of entriesOverlapping) {
    const overlapStart = Math.max(entry.clockIn.getTime(), from.getTime());
    const overlapEnd = Math.min((entry.clockOut ?? now).getTime(), to.getTime());
    const ms = Math.max(0, overlapEnd - overlapStart);
    hoursByUser.set(entry.userId, (hoursByUser.get(entry.userId) ?? 0) + ms / 3_600_000);
  }

  return users.map((u) => {
    const calls = callsByUser.get(u.id) ?? 0;
    const hours = Math.round((hoursByUser.get(u.id) ?? 0) * 100) / 100;
    const byStatus = statusByUser.get(u.id) ?? {};
    const totalBusinesses = Object.values(byStatus).reduce((a, b) => a + b, 0);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      active: u.active,
      callsInRange: calls,
      hoursInRange: hours,
      callsPerHour: hours > 0.05 ? Math.round((calls / hours) * 10) / 10 : null,
      totalBusinesses,
      byStatus,
      dueToday: dueTodayByUser.get(u.id) ?? 0,
      revenueInRange: revenueByUser.get(u.id) ?? 0,
      dealsInRange: dealsByUser.get(u.id) ?? 0,
    };
  });
}

/** Rango [hace `days-1` días a las 00:00, hoy a las 23:59:59]. */
export function defaultRange(days: number): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

// Un hueco de esta duración o más, sin ninguna llamada ni cambio de gestión
// registrado, cuenta como "posible inactividad" mientras se está fichado.
// No mide teclas ni ratón — solo cruza el fichaje contra la actividad que ya
// queda registrada en la consola, así que un hueco marcado no es una prueba
// de que no se trabajó (pudo estar al teléfono con algo que no toca
// registrar), es una señal para que el admin lo revise, no un veredicto.
const IDLE_THRESHOLD_MINUTES = 20;

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  clockedMinutes: number;
  idleMinutes: number;
  activeMinutes: number;
  callsMade: number;
}

export interface IdleGap {
  date: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
}

export interface AgentDetail {
  daily: DailyPoint[];
  idleGaps: IdleGap[];
  totalClockedMinutes: number;
  totalIdleMinutes: number;
  totalActiveMinutes: number;
  idleThresholdMinutes: number;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Serie diaria (horas fichadas/activas/inactivas y llamadas) + huecos de
 * inactividad de un agente en [from, to]. Usado por el panel de detalle de
 * /admin/stats (gráficas + tabla).
 */
export async function getAgentDetail(userId: string, from: Date, to: Date): Promise<AgentDetail> {
  const now = new Date();

  const [entries, calls, audits] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId, clockIn: { lte: to }, OR: [{ clockOut: null }, { clockOut: { gte: from } }] },
      orderBy: { clockIn: "asc" },
      select: { clockIn: true, clockOut: true },
    }),
    prisma.callActivity.findMany({
      where: { userId, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
    prisma.auditLog.findMany({
      where: { userId, createdAt: { gte: from, lte: to } },
      select: { createdAt: true },
    }),
  ]);

  const clockedByDay = new Map<string, number>(); // minutos
  const idleByDay = new Map<string, number>();
  const callsByDay = new Map<string, number>();

  for (let d = new Date(from); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
    const key = dayKey(d);
    clockedByDay.set(key, 0);
    idleByDay.set(key, 0);
    callsByDay.set(key, 0);
  }

  for (const c of calls) {
    const key = dayKey(c.createdAt);
    callsByDay.set(key, (callsByDay.get(key) ?? 0) + 1);
  }

  const activityTimes = [...calls, ...audits].map((a) => a.createdAt.getTime()).sort((a, b) => a - b);

  const idleGaps: IdleGap[] = [];
  let totalClockedMs = 0;
  let totalIdleMs = 0;

  for (const entry of entries) {
    const segStart = Math.max(entry.clockIn.getTime(), from.getTime());
    const segEnd = Math.min((entry.clockOut ?? now).getTime(), to.getTime());
    if (segEnd <= segStart) continue;
    totalClockedMs += segEnd - segStart;

    // Reparte los minutos fichados de este tramo entre los días que cruza.
    let cursor = segStart;
    while (cursor < segEnd) {
      const cursorDate = new Date(cursor);
      const dayEnd = new Date(cursorDate);
      dayEnd.setHours(23, 59, 59, 999);
      const chunkEnd = Math.min(dayEnd.getTime(), segEnd);
      const key = dayKey(cursorDate);
      clockedByDay.set(key, (clockedByDay.get(key) ?? 0) + (chunkEnd - cursor) / 60_000);
      cursor = chunkEnd + 1;
    }

    // Huecos sin actividad dentro de este tramo fichado.
    const within = activityTimes.filter((t) => t >= segStart && t <= segEnd);
    const points = [segStart, ...within, segEnd];
    for (let i = 1; i < points.length; i++) {
      const gapMs = points[i] - points[i - 1];
      const gapMin = gapMs / 60_000;
      if (gapMin >= IDLE_THRESHOLD_MINUTES) {
        const key = dayKey(new Date(points[i - 1]));
        idleByDay.set(key, (idleByDay.get(key) ?? 0) + gapMin);
        idleGaps.push({
          date: key,
          startedAt: new Date(points[i - 1]).toISOString(),
          endedAt: new Date(points[i]).toISOString(),
          minutes: Math.round(gapMin),
        });
        totalIdleMs += gapMs;
      }
    }
  }

  const daily: DailyPoint[] = [...clockedByDay.keys()].sort().map((date) => {
    const clockedMinutes = Math.round((clockedByDay.get(date) ?? 0) * 10) / 10;
    const idleMinutes = Math.round((idleByDay.get(date) ?? 0) * 10) / 10;
    return {
      date,
      clockedMinutes,
      idleMinutes,
      activeMinutes: Math.max(0, Math.round((clockedMinutes - idleMinutes) * 10) / 10),
      callsMade: callsByDay.get(date) ?? 0,
    };
  });

  return {
    daily,
    idleGaps: idleGaps.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()),
    totalClockedMinutes: Math.round(totalClockedMs / 60_000),
    totalIdleMinutes: Math.round(totalIdleMs / 60_000),
    totalActiveMinutes: Math.round((totalClockedMs - totalIdleMs) / 60_000),
    idleThresholdMinutes: IDLE_THRESHOLD_MINUTES,
  };
}
