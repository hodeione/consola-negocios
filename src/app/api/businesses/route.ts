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
]);

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const filters = parseBusinessFilters(sp);
  const where = buildBusinessWhere(filters, user);

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
