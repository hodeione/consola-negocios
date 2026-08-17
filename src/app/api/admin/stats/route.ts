import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getAgentStats, defaultRange } from "@/lib/admin-stats";

/**
 * Estadísticas por agente: llamadas realizadas, horas fichadas y llamadas
 * por hora en un rango de fechas, más una foto actual de su cartera
 * (negocios por estado). Solo admin — es la vista para "dirigir el equipo"
 * que no existía antes (ver auditoría del 17 ago 2026).
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const { from: defaultFrom, to: defaultTo } = defaultRange(7);
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from = fromRaw && !isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : defaultFrom;
  const to = toRaw && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : defaultTo;

  const agents = await getAgentStats(from, to);

  return NextResponse.json({ range: { from: from.toISOString(), to: to.toISOString() }, agents });
}
