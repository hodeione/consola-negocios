import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { defaultRange } from "@/lib/admin-stats";
import { getSalesOverview } from "@/lib/sales-overview";

/** Embudo, dinero, sectores, horas y reparto diario en un rango (ver lib/sales-overview.ts). Solo admin. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const { from: defaultFrom, to: defaultTo } = defaultRange(30);
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from = fromRaw && !isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : defaultFrom;
  const to = toRaw && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : defaultTo;

  return NextResponse.json(await getSalesOverview(from, to));
}
