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
