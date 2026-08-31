import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { detailPlacesBatch } from "@/lib/scraper/maps";
import { fetchContactInfo } from "@/lib/scraper/contact-extract";
import { computeDigitalNeed } from "@/lib/scraper/digital-need";

function canAccess(business: { assignedToUserId: string | null; ownerId: string }, user: { id: string; role: string }) {
  if (user.role === "ADMIN") return true;
  return business.assignedToUserId === user.id || business.ownerId === user.id;
}

/**
 * Vuelve a visitar la ficha de Maps de un negocio ya guardado y refresca sus
 * datos "de scraping" (nombre, dirección, teléfono, web, rating, categoría,
 * emails/teléfonos de la web) sin tocar nada de gestión (estado, notas,
 * etiquetas...). Pasa por launchBrowser(), así que respeta el mismo kill
 * switch que el resto del scraping (ver src/lib/scraper/browser.ts).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: { sourceTask: { select: { language: true } } },
  });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!canAccess(business, user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  if (!business.mapsUrl) {
    return NextResponse.json(
      { error: "Esta ficha no tiene guardado el enlace de Maps (se scrapeó antes de que existiera este campo) — no se puede re-scrapear." },
      { status: 400 }
    );
  }

  const language = business.sourceTask?.language || "es";

  let detail;
  try {
    const { details } = await detailPlacesBatch([business.mapsUrl], language, 20000);
    detail = details[0];
  } catch (err) {
    return NextResponse.json(
      { error: `Fallo visitando la ficha en Maps: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
  if (!detail || !detail.name) {
    return NextResponse.json({ error: "No se pudo leer la ficha (puede que ya no esté disponible en Maps)" }, { status: 502 });
  }

  const { emails, webPhones, homeHtml, homeFetchOk } = detail.website
    ? await fetchContactInfo(detail.website)
    : { emails: [], webPhones: [], homeHtml: "", homeFetchOk: false };
  const { signals, score } = computeDigitalNeed({ website: detail.website, homeHtml, homeFetchOk });

  const updated = await prisma.business.update({
    where: { id },
    data: {
      name: detail.name,
      address: detail.address,
      mapsPhone: detail.phone,
      website: detail.website,
      mapsUrl: detail.sourceUrl,
      rating: detail.rating,
      category: detail.category,
      emails,
      webPhones,
      digitalNeedSignals: signals,
      digitalNeedScore: score,
      lastVerifiedAt: new Date(),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json(updated);
}
