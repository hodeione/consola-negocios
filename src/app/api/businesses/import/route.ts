import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildDedupeKey } from "@/lib/scraper/dedupe";

export const runtime = "nodejs";
export const maxDuration = 60;

const STATUS_BY_LABEL: Record<string, string> = {
  "pendiente": "PENDING",
  "no contesta": "NO_ANSWER",
  "llamar más tarde": "CALLBACK_LATER",
  "interesado": "INTERESTED",
  "no interesado": "NOT_INTERESTED",
  "cliente": "CUSTOMER",
  "número inválido": "INVALID_NUMBER",
};
const PRIORITY_BY_LABEL: Record<string, string> = { baja: "LOW", media: "MEDIUM", alta: "HIGH" };
const PRODUCT_BY_LABEL: Record<string, string> = {
  "landing page": "LANDING",
  seo: "SEO",
  "e-commerce": "ECOMMERCE",
  saas: "SAAS",
  "a medida": "CUSTOM",
  otro: "OTHER",
};

// Mismo orden de columnas que "Exportar Excel" (ver src/app/api/businesses/export/route.ts).
// Producto/Importe/Fecha de cierre van al final — opcionales, para que los
// ficheros generados antes de añadir el pipeline de ventas se sigan
// importando sin problema (esas columnas simplemente no existen en ellos).
const COL = {
  name: 1,
  zone: 2,
  keyword: 3,
  address: 4,
  mapsPhone: 5,
  website: 6,
  emails: 7,
  webPhones: 8,
  rating: 9,
  category: 10,
  status: 11,
  priority: 12,
  contactName: 13,
  contactRole: 14,
  tags: 15,
  product: 19,
  dealValue: 20,
  closedAt: 21,
  mapsUrl: 22,
  digitalNeedSignals: 23,
  digitalNeedScore: 24,
};

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "");
  if (typeof v === "object" && "richText" in v) {
    return (v as { richText: { text: string }[] }).richText.map((r) => r.text).join("");
  }
  return String(v).trim();
}

function splitList(text: string): string[] {
  return text
    .split(/[;,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Falta el fichero .xlsx" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  try {
    // Cast a `any`: los tipos de exceljs esperan el Buffer "clásico" de
    // @types/node, que en su definición genérica no coincide exactamente
    // con el Buffer<ArrayBuffer> que devuelve Buffer.from() en versiones
    // recientes — son compatibles en tiempo de ejecución, solo difiere el
    // tipado. `as unknown as Buffer` no basta porque sigue comprobando la
    // forma estructural del genérico; `any` evita ese chequeo por completo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buffer as any);
  } catch {
    return NextResponse.json({ error: "El fichero no es un .xlsx válido" }, { status: 400 });
  }

  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ error: "El Excel no tiene ninguna hoja" }, { status: 400 });

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let rowIndex = 2; rowIndex <= ws.rowCount; rowIndex++) {
    const row = ws.getRow(rowIndex);
    if (row.cellCount === 0) continue;

    const name = cellText(row.getCell(COL.name));
    const zone = cellText(row.getCell(COL.zone));
    if (!name || !zone) {
      skipped++;
      continue;
    }

    const mapsPhone = cellText(row.getCell(COL.mapsPhone));
    const website = cellText(row.getCell(COL.website));
    const emails = splitList(cellText(row.getCell(COL.emails)));
    const webPhones = splitList(cellText(row.getCell(COL.webPhones)));

    // Misma regla que el scraper en vivo: solo se guardan negocios con algún
    // dato de contacto.
    if (!mapsPhone && emails.length === 0 && webPhones.length === 0) {
      skipped++;
      continue;
    }

    const ratingRaw = cellText(row.getCell(COL.rating)).replace(",", ".");
    const rating = parseFloat(ratingRaw) || 0;
    const statusLabel = cellText(row.getCell(COL.status)).toLowerCase();
    const priorityLabel = cellText(row.getCell(COL.priority)).toLowerCase();
    const tags = splitList(cellText(row.getCell(COL.tags)));
    const productLabel = cellText(row.getCell(COL.product)).toLowerCase();
    const dealValueRaw = cellText(row.getCell(COL.dealValue)).replace(",", ".");
    const dealValue = parseFloat(dealValueRaw) || 0;
    const closedAtRaw = cellText(row.getCell(COL.closedAt));
    const closedAt = closedAtRaw && !isNaN(Date.parse(closedAtRaw)) ? new Date(closedAtRaw) : undefined;
    const digitalNeedSignals = splitList(cellText(row.getCell(COL.digitalNeedSignals)));
    const digitalNeedScore = parseInt(cellText(row.getCell(COL.digitalNeedScore)), 10) || 0;

    const dedupeKey = buildDedupeKey({ website, phone: mapsPhone, name });
    const fields = {
      name,
      zone,
      keyword: cellText(row.getCell(COL.keyword)),
      address: cellText(row.getCell(COL.address)),
      mapsPhone,
      website,
      mapsUrl: cellText(row.getCell(COL.mapsUrl)),
      emails,
      webPhones,
      rating,
      category: cellText(row.getCell(COL.category)),
      digitalNeedSignals,
      digitalNeedScore,
    };

    try {
      await prisma.business.upsert({
        where: { ownerId_dedupeKey: { ownerId: user.id, dedupeKey } },
        create: {
          ...fields,
          dedupeKey,
          ownerId: user.id,
          assignedToUserId: user.id,
          status: (STATUS_BY_LABEL[statusLabel] as never) ?? undefined,
          priority: (PRIORITY_BY_LABEL[priorityLabel] as never) ?? undefined,
          contactName: cellText(row.getCell(COL.contactName)),
          contactRole: cellText(row.getCell(COL.contactRole)),
          tags,
          lastVerifiedAt: new Date(),
          product: (PRODUCT_BY_LABEL[productLabel] as never) ?? undefined,
          dealValue,
          ...(closedAt && { closedAt }),
        },
        // No pisamos el estado/prioridad/etiquetas si el negocio ya existía
        // y alguien ya lo estaba gestionando — solo actualizamos los datos
        // "de scraping". Sí actualizamos lastVerifiedAt: reimportar ES
        // volver a verificar estos datos.
        update: { ...fields, lastVerifiedAt: new Date() },
      });
      imported++;
    } catch (err) {
      errors.push(`Fila ${rowIndex} (${name}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    imported,
    skipped,
    errors: errors.slice(0, 10),
    errorCount: errors.length,
  });
}
