import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/** Lista de fichajes recientes, para revisar/corregir olvidos. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const userId = sp.get("userId") || undefined;
  const onlyOpen = sp.get("onlyOpen") === "true";

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      ...(onlyOpen ? { clockOut: null } : {}),
    },
    orderBy: { clockIn: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(entries);
}
