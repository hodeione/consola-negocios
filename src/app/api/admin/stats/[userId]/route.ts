import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getAgentDetail, defaultRange } from "@/lib/admin-stats";

/** Detalle diario (horas activas/inactivas, llamadas) + huecos de inactividad de un agente. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { userId } = await params;
  const sp = request.nextUrl.searchParams;
  const { from: defaultFrom, to: defaultTo } = defaultRange(7);
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from = fromRaw && !isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : defaultFrom;
  const to = toRaw && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : defaultTo;

  const detail = await getAgentDetail(userId, from, to);
  return NextResponse.json(detail);
}
