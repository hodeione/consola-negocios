import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

// \p{Mn} = "Mark, nonspacing" — la categoría Unicode de los acentos
// combinados que deja normalize("NFD"). Más robusto que un rango de
// caracteres literal (que depende de cómo el editor guarde el byte).
const DIACRITICS_RE = /\p{Mn}/gu;

/**
 * Normaliza un nombre de negocio para comparar: minúsculas, sin acentos, sin
 * formas societarias (S.L., S.A....) ni puntuación. El dedupeKey del scraper
 * exige coincidencia EXACTA de web/teléfono/nombre — esto pilla el caso más
 * habitual que se le escapa: el mismo negocio guardado dos veces con el
 * nombre escrito de forma ligeramente distinta ("Bar Paco" / "Bar Paco S.L."
 * / "BAR PACO").
 */
function normalizeNameForDupe(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/\b(s\.?\s?l\.?u?\.?|s\.?\s?a\.?u?\.?|s\.?\s?coop\.?|c\.?\s?b\.?)\b/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface DuplicateGroup {
  key: string;
  businesses: {
    id: string;
    name: string;
    zone: string;
    address: string;
    mapsPhone: string;
    status: string;
    assignedTo: { id: string; name: string } | null;
  }[];
}

export async function findPossibleDuplicates(scopeWhere: Prisma.BusinessWhereInput): Promise<DuplicateGroup[]> {
  const businesses = await prisma.business.findMany({
    where: scopeWhere,
    select: {
      id: true,
      name: true,
      zone: true,
      address: true,
      mapsPhone: true,
      status: true,
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const groups = new Map<string, DuplicateGroup["businesses"]>();
  for (const b of businesses) {
    const normalized = normalizeNameForDupe(b.name);
    if (!normalized) continue;
    const key = `${b.zone.trim().toLowerCase()}|${normalized}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(b);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, businesses: list }))
    .sort((a, b) => b.businesses.length - a.businesses.length);
}
