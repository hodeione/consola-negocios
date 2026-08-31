import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { fetchHomePage } from "@/lib/scraper/contact-extract";
import { computeDigitalNeed } from "@/lib/scraper/digital-need";

export const maxDuration = 60;

const BATCH_SIZE = 60;

/**
 * Recalcula digitalNeedScore/digitalNeedSignals para negocios que ya
 * existían antes de que existiera esta puntuación (importados/scrapeados
 * antes de añadir src/lib/scraper/digital-need.ts). Un lote acotado por
 * llamada (paginado por id) — el cliente va llamando en bucle hasta que
 * `done: true`, igual que el patrón de pasos del scraping en la nube.
 * Solo ADMIN: recorre y modifica todos los negocios, no solo los propios.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador puede usar esta acción" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const afterId: string | undefined = body?.afterId;

  const batch = await prisma.business.findMany({
    where: afterId ? { id: { gt: afterId } } : undefined,
    orderBy: { id: "asc" },
    take: BATCH_SIZE,
    select: { id: true, website: true },
  });

  if (batch.length === 0) {
    return NextResponse.json({ processed: 0, done: true, lastId: null });
  }

  await Promise.all(
    batch.map(async (b) => {
      const { html, ok } = b.website ? await fetchHomePage(b.website) : { html: "", ok: false };
      const { signals, score } = computeDigitalNeed({ website: b.website, homeHtml: html, homeFetchOk: ok });
      await prisma.business.update({
        where: { id: b.id },
        data: { digitalNeedSignals: signals, digitalNeedScore: score },
      });
    })
  );

  const lastId = batch[batch.length - 1].id;
  const done = batch.length < BATCH_SIZE;
  return NextResponse.json({ processed: batch.length, done, lastId });
}
