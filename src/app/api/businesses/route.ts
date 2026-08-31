import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere, parseBusinessFilters } from "@/lib/businesses/filters";
import type { Prisma } from "@/generated/prisma/client";

const SORTABLE = new Set([
  "createdAt",
  "updatedAt",
  "name",
  "zone",
  "status",
  "priority",
  "nextFollowUpAt",
  "lastCalledAt",
  "rating",
  "digitalNeedScore",
]);

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const filters = parseBusinessFilters(sp);
  const where = buildBusinessWhere(filters, user);

  // "Olvidados": en el pipeline (no cerrados) desde hace tiempo y sin
  // ninguna llamada reciente — no cabe en el filtro genérico porque
  // necesita una subconsulta, así que se resuelve aparte.
  if (sp.get("forgottenOnly") === "true") {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recentlyActive = await prisma.callActivity.findMany({
      where: { createdAt: { gte: cutoff }, business: where },
      select: { businessId: true },
      distinct: ["businessId"],
    });
    Object.assign(where, {
      status: { notIn: ["CUSTOMER", "NOT_INTERESTED", "INVALID_NUMBER"] },
      createdAt: { lte: cutoff },
      id: { notIn: recentlyActive.map((r) => r.businessId) },
    });
  }

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize")) || 50));
  const sortByRaw = sp.get("sortBy") || "createdAt";
  const sortBy = SORTABLE.has(sortByRaw) ? sortByRaw : "createdAt";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";

  const orderBy = { [sortBy]: sortDir } as Prisma.BusinessOrderByWithRelationInput;

  const [items, total] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedTo: { select: { id: true, name: true } } },
    }),
    prisma.business.count({ where }),
  ]);

  return NextResponse.json({ items, total, page, pageSize });
}
