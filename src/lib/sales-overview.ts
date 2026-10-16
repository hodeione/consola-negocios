import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { startOfTodayMadrid } from "@/lib/timezone";
import { detectSector, SECTOR_LABEL } from "@/lib/businesses/sales-recommendation";

/**
 * Visión de ventas del equipo en [from, to] para /admin/stats: embudo por
 * agente, facturado vs cobrado, ventas por producto, conversión por sector,
 * a qué hora se contacta y se cierra más, seguimientos vencidos y cómo va el
 * reparto diario automático.
 *
 * Se calcula en memoria: el volumen (miles de negocios/llamadas) lo permite y
 * así cada métrica se lee de un vistazo en lugar de en SQL.
 */

// Resultados de llamada que cuentan como "hemos hablado con alguien".
const CONTACT_OUTCOMES = new Set(["CALLBACK_LATER", "INTERESTED", "NOT_INTERESTED", "CUSTOMER"]);
const POSITIVE_OUTCOMES = new Set(["INTERESTED", "CUSTOMER"]);
const OPEN_STATUSES = ["PENDING", "NO_ANSWER", "CALLBACK_LATER", "INTERESTED"] as const;

export interface FunnelRow {
  id: string;
  name: string;
  called: number;
  contacted: number;
  interested: number;
  customers: number;
  revenue: number;
  overdueFollowUps: number;
}

export interface SalesOverview {
  totals: FunnelRow;
  agents: FunnelRow[];
  money: { invoiced: number; deals: number; avgTicket: number; collected: number; pendingCollection: number; pendingCount: number };
  byProduct: { product: string; deals: number; revenue: number }[];
  bySector: { sector: string; label: string; called: number; interested: number; customers: number; conversionPct: number }[];
  byHour: { hour: number; calls: number; contacted: number; positive: number }[];
  autoAssign: { assigned: number; called: number; interested: number; customers: number };
}

const madridHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false });

async function getSalesOverviewUncached(from: Date, to: Date): Promise<SalesOverview> {
  const startOfToday = startOfTodayMadrid();

  const [users, calls, closed, paidSum, pending, overdue, autoAssigned] = await Promise.all([
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.callActivity.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { businessId: true, userId: true, outcome: true, createdAt: true, business: { select: { keyword: true, category: true } } },
    }),
    prisma.business.findMany({
      where: { closedAt: { gte: from, lte: to } },
      select: { id: true, assignedToUserId: true, dealValue: true, product: true, keyword: true, category: true },
    }),
    prisma.business.aggregate({ where: { paid: true, paidAt: { gte: from, lte: to } }, _sum: { dealValue: true } }),
    prisma.business.aggregate({ where: { closedAt: { not: null }, paid: false }, _sum: { dealValue: true }, _count: { _all: true } }),
    prisma.business.groupBy({
      by: ["assignedToUserId"],
      where: { nextFollowUpAt: { lt: startOfToday }, status: { in: [...OPEN_STATUSES] } },
      _count: { _all: true },
    }),
    prisma.auditLog.findMany({
      where: { action: "auto_assigned", createdAt: { gte: from, lte: to } },
      select: { business: { select: { id: true, status: true, lastCalledAt: true, closedAt: true } } },
    }),
  ]);

  // ── Embudo por agente ─────────────────────────────────
  type Sets = { called: Set<string>; contacted: Set<string>; interested: Set<string>; customers: Set<string>; revenue: number };
  const empty = (): Sets => ({ called: new Set(), contacted: new Set(), interested: new Set(), customers: new Set(), revenue: 0 });
  const byAgent = new Map<string, Sets>();
  const team = empty();
  const bucket = (id: string) => byAgent.get(id) ?? byAgent.set(id, empty()).get(id)!;

  for (const c of calls) {
    for (const s of [bucket(c.userId), team]) {
      s.called.add(c.businessId);
      if (CONTACT_OUTCOMES.has(c.outcome)) s.contacted.add(c.businessId);
      if (POSITIVE_OUTCOMES.has(c.outcome)) s.interested.add(c.businessId);
      if (c.outcome === "CUSTOMER") s.customers.add(c.businessId);
    }
  }
  for (const b of closed) {
    const targets = b.assignedToUserId ? [bucket(b.assignedToUserId), team] : [team];
    for (const s of targets) {
      s.customers.add(b.id);
      s.revenue += b.dealValue;
    }
  }

  const overdueByUser = new Map(overdue.map((r) => [r.assignedToUserId ?? "", r._count._all]));
  const toRow = (id: string, name: string, s: Sets, overdueFollowUps: number): FunnelRow => ({
    id,
    name,
    called: s.called.size,
    contacted: s.contacted.size,
    interested: s.interested.size,
    customers: s.customers.size,
    revenue: Math.round(s.revenue),
    overdueFollowUps,
  });

  const agents = users
    .map((u) => toRow(u.id, u.name, byAgent.get(u.id) ?? empty(), overdueByUser.get(u.id) ?? 0))
    .filter((r) => r.called > 0 || r.customers > 0 || r.overdueFollowUps > 0);
  const totals = toRow("team", "Equipo", team, [...overdueByUser.values()].reduce((a, b) => a + b, 0));

  // ── Dinero ────────────────────────────────────────────
  const invoiced = closed.reduce((a, b) => a + b.dealValue, 0);
  const money = {
    invoiced: Math.round(invoiced),
    deals: closed.length,
    avgTicket: closed.length ? Math.round(invoiced / closed.length) : 0,
    collected: Math.round(paidSum._sum.dealValue ?? 0),
    pendingCollection: Math.round(pending._sum.dealValue ?? 0),
    pendingCount: pending._count._all,
  };

  const productMap = new Map<string, { deals: number; revenue: number }>();
  for (const b of closed) {
    const key = b.product ?? "SIN_PRODUCTO";
    const p = productMap.get(key) ?? { deals: 0, revenue: 0 };
    p.deals++;
    p.revenue += b.dealValue;
    productMap.set(key, p);
  }
  const byProduct = [...productMap.entries()]
    .map(([product, p]) => ({ product, deals: p.deals, revenue: Math.round(p.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Por sector ────────────────────────────────────────
  const sectorMap = new Map<string, Sets>();
  const sectorBucket = (k: string) => sectorMap.get(k) ?? sectorMap.set(k, empty()).get(k)!;
  for (const c of calls) {
    const s = sectorBucket(detectSector(c.business.keyword, c.business.category));
    s.called.add(c.businessId);
    if (POSITIVE_OUTCOMES.has(c.outcome)) s.interested.add(c.businessId);
    if (c.outcome === "CUSTOMER") s.customers.add(c.businessId);
  }
  for (const b of closed) sectorBucket(detectSector(b.keyword, b.category)).customers.add(b.id);
  const bySector = [...sectorMap.entries()]
    .map(([sector, s]) => ({
      sector,
      label: SECTOR_LABEL[sector] ?? sector,
      called: s.called.size,
      interested: s.interested.size,
      customers: s.customers.size,
      conversionPct: s.called.size ? Math.round((s.interested.size / s.called.size) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.called - a.called);

  // ── Por hora del día (hora de España) ─────────────────
  const hours = new Map<number, { calls: number; contacted: number; positive: number }>();
  for (const c of calls) {
    const h = Number(madridHour.format(c.createdAt)) % 24;
    const row = hours.get(h) ?? { calls: 0, contacted: 0, positive: 0 };
    row.calls++;
    if (CONTACT_OUTCOMES.has(c.outcome)) row.contacted++;
    if (POSITIVE_OUTCOMES.has(c.outcome)) row.positive++;
    hours.set(h, row);
  }
  const byHour = Array.from({ length: 13 }, (_, i) => i + 8).map((hour) => ({ hour, ...(hours.get(hour) ?? { calls: 0, contacted: 0, positive: 0 }) }));

  // ── Reparto diario ────────────────────────────────────
  const assignedBiz = new Map(autoAssigned.map((a) => [a.business.id, a.business]));
  const autoAssign = {
    assigned: assignedBiz.size,
    called: [...assignedBiz.values()].filter((b) => b.lastCalledAt).length,
    interested: [...assignedBiz.values()].filter((b) => b.status === "INTERESTED" || b.status === "CUSTOMER").length,
    customers: [...assignedBiz.values()].filter((b) => b.status === "CUSTOMER" || b.closedAt).length,
  };

  return { totals, agents, money, byProduct, bySector, byHour, autoAssign };
}

// Mismo criterio de caché que getAgentStats (30s) — se pide en cada cambio de rango.
const getSalesOverviewCached = unstable_cache(
  async (fromISO: string, toISO: string) => getSalesOverviewUncached(new Date(fromISO), new Date(toISO)),
  ["admin-sales-overview"],
  { revalidate: 30 }
);

export async function getSalesOverview(from: Date, to: Date): Promise<SalesOverview> {
  return getSalesOverviewCached(from.toISOString(), to.toISOString());
}
