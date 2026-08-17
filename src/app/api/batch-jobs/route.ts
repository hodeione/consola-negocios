import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { isScrapingAllowed } from "@/lib/scraper/browser";

const bodySchema = z.object({
  // Vacío ("") es válido: significa "todos los tipos de negocio" en esa zona.
  keywords: z.array(z.string().trim().max(100)).max(50),
  zones: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  maxResultsPerCombo: z.number().int().min(1).max(500).default(60),
  language: z.string().trim().min(2).max(5).default("es"),
});

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Mismo kill switch que /api/scrape-tasks/[id]/step — bloquear aquí evita
  // crear tareas que luego se quedarían atascadas chocando con el 403 de
  // /step una y otra vez. Ver ese fichero para más contexto.
  if (!isScrapingAllowed()) {
    return NextResponse.json(
      {
        error:
          "El scraping en la nube está desactivado. Usa el scraper local (npm run scrape:local) " +
          "y sube el Excel resultante con el botón «Importar Excel».",
      },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { keywords, zones, maxResultsPerCombo, language } = parsed.data;

  const uniqueZones = [...new Set(zones.map((z) => z.trim()).filter(Boolean))];
  if (uniqueZones.length === 0) {
    return NextResponse.json({ error: "Añade al menos una zona" }, { status: 400 });
  }
  // keywords vacío → una sola combinación por zona, sin filtrar por tipo de negocio.
  const uniqueKeywords = [...new Set(keywords.map((k) => k.trim()))];
  const keywordList = uniqueKeywords.length > 0 ? uniqueKeywords : [""];

  const batchJob = await prisma.batchJob.create({
    data: {
      ownerId: user.id,
      keywords: keywordList,
      zones: uniqueZones,
      maxResultsPerCombo,
      language,
      status: "PENDING",
      tasks: {
        create: uniqueZones.flatMap((zone) =>
          keywordList.map((keyword) => ({
            ownerId: user.id,
            keyword,
            zone,
            maxResults: maxResultsPerCombo,
            language,
            status: "PENDING" as const,
          }))
        ),
      },
    },
    include: { tasks: true },
  });

  return NextResponse.json(batchJob, { status: 201 });
}

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const batchJobs = await prisma.batchJob.findMany({
    where: user.role === "ADMIN" ? {} : { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: { tasks: true },
  });

  return NextResponse.json(batchJobs);
}
