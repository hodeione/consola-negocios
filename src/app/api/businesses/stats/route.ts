import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const scopeWhere = user.role === "ADMIN" ? {} : { assignedToUserId: user.id };
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [total, byStatusRaw, dueToday] = await Promise.all([
    prisma.business.count({ where: scopeWhere }),
    prisma.business.groupBy({
      by: ["status"],
      where: scopeWhere,
      _count: { _all: true },
    }),
    prisma.business.count({
      where: { ...scopeWhere, nextFollowUpAt: { lte: endOfToday } },
    }),
  ]);

  const byStatus = Object.fromEntries(byStatusRaw.map((r) => [r.status, r._count._all]));

  return NextResponse.json({ total, byStatus, dueToday });
}
