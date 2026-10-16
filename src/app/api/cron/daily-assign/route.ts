import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { startOfTodayMadrid } from "@/lib/timezone";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Reparto diario automático: cada día se le pasan a un agente N negocios
 * pendientes que estaban asignados a otros. Se eligen "los mejores": sin
 * llamar todavía, con teléfono, no marcados como incorrectos, y ordenados por
 * necesidad digital (y valoración como desempate).
 */
const DAILY_ASSIGNMENTS = [
  { to: "cheky@gmail.com", perDay: 10, from: ["agueda@gmail.com", "hodeione41@gmail.com"] },
];

const AUTO_ASSIGN_ACTION = "auto_assigned";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // El AuditLog exige un usuario: se atribuye al primer admin activo.
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!admin) return NextResponse.json({ error: "Sin admins activos" }, { status: 500 });

  const startOfToday = startOfTodayMadrid();
  const results = [];

  for (const rule of DAILY_ASSIGNMENTS) {
    const target = await prisma.user.findUnique({ where: { email: rule.to }, select: { id: true, name: true, active: true } });
    if (!target?.active) {
      results.push({ to: rule.to, assigned: 0, reason: "usuario destino no existe o está inactivo" });
      continue;
    }
    const sources = await prisma.user.findMany({ where: { email: { in: rule.from } }, select: { id: true, name: true } });

    // Si el cron se dispara dos veces el mismo día, no repartir de más.
    const alreadyToday = await prisma.auditLog.count({
      where: { action: AUTO_ASSIGN_ACTION, createdAt: { gte: startOfToday }, business: { assignedToUserId: target.id } },
    });
    const remaining = rule.perDay - alreadyToday;
    if (remaining <= 0) {
      results.push({ to: rule.to, assigned: 0, reason: "ya repartido hoy" });
      continue;
    }

    const picked = await prisma.business.findMany({
      where: {
        assignedToUserId: { in: sources.map((s) => s.id) },
        status: "PENDING",
        lastCalledAt: null,
        flaggedIncorrect: false,
        OR: [{ mapsPhone: { not: "" } }, { webPhones: { isEmpty: false } }],
      },
      orderBy: [{ digitalNeedScore: "desc" }, { rating: "desc" }, { createdAt: "asc" }],
      take: remaining,
      select: { id: true, assignedToUserId: true },
    });
    if (picked.length === 0) {
      results.push({ to: rule.to, assigned: 0, reason: "no quedan negocios pendientes en el origen" });
      continue;
    }

    const sourceName = new Map(sources.map((s) => [s.id, s.name]));
    await prisma.$transaction([
      prisma.business.updateMany({ where: { id: { in: picked.map((b) => b.id) } }, data: { assignedToUserId: target.id } }),
      prisma.auditLog.createMany({
        data: picked.map((b) => ({
          businessId: b.id,
          userId: admin.id,
          action: AUTO_ASSIGN_ACTION,
          detail: `reparto diario: ${sourceName.get(b.assignedToUserId ?? "") ?? "?"} → ${target.name}`,
        })),
      }),
    ]);
    results.push({ to: rule.to, assigned: picked.length });
  }

  return NextResponse.json({ results });
}
