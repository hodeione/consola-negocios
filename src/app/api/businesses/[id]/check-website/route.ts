import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

function canAccess(business: { assignedToUserId: string | null; ownerId: string }, user: { id: string; role: string }) {
  if (user.role === "ADMIN") return true;
  return business.assignedToUserId === user.id || business.ownerId === user.id;
}

/**
 * Comprobación puntual (no un cron automático) de si la web de un negocio
 * sigue respondiendo. A propósito no es un job en segundo plano que recorra
 * toda la base: lo dispara la propia persona desde la ficha, cuando le
 * interesa saberlo — un cron periódico contra cientos de webs añadiría
 * tráfico saliente constante sin que nadie lo haya pedido.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const business = await prisma.business.findUnique({ where: { id }, select: { website: true, assignedToUserId: true, ownerId: true } });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!canAccess(business, user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!business.website) return NextResponse.json({ error: "Este negocio no tiene web guardada" }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(business.website, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ConsolaNegociosBot/1.0)" },
    });
    return NextResponse.json({ alive: res.ok, status: res.status, checkedAt: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({
      alive: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
      checkedAt: new Date().toISOString(),
    });
  } finally {
    clearTimeout(timeout);
  }
}
