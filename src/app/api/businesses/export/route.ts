import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere, parseBusinessFilters } from "@/lib/businesses/filters";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendiente",
  NO_ANSWER: "No contesta",
  CALLBACK_LATER: "Llamar más tarde",
  INTERESTED: "Interesado",
  NOT_INTERESTED: "No interesado",
  CUSTOMER: "Cliente",
  INVALID_NUMBER: "Número inválido",
};
const PRIORITY_LABEL: Record<string, string> = { LOW: "Baja", MEDIUM: "Media", HIGH: "Alta" };
const PRODUCT_LABEL: Record<string, string> = {
  LANDING: "Landing page",
  SEO: "SEO",
  ECOMMERCE: "E-commerce",
  SAAS: "SaaS",
  CUSTOM: "A medida",
  OTHER: "Otro",
};

const EXPORT_LIMIT = 5000;

// Nota: las columnas de venta van al final a propósito — /api/businesses/import
// lee por índice de columna fijo, así que añadir aquí en medio rompería la
// compatibilidad con ficheros ya generados (p.ej. los del scraper local).
const HEADERS = [
  "Nombre",
  "Zona",
  "Keyword",
  "Dirección",
  "Tel. Maps",
  "Web",
  "Emails",
  "Tel. Web",
  "Rating",
  "Categoría",
  "Estado",
  "Prioridad",
  "Contacto",
  "Cargo",
  "Etiquetas",
  "Próxima llamada",
  "Último contacto",
  "Asignado a",
  "Producto",
  "Importe",
  "Fecha de cierre",
];
const COL_WIDTHS = [28, 18, 16, 40, 16, 34, 40, 24, 8, 20, 16, 10, 20, 18, 22, 16, 16, 18, 16, 12, 16];

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sp = request.nextUrl.searchParams;
  const where = buildBusinessWhere(parseBusinessFilters(sp), user);

  const businesses = await prisma.business.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
    include: { assignedTo: { select: { name: true } } },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Negocios");

  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell, colIndex) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFD1D5DB" } },
      left: { style: "thin", color: { argb: "FFD1D5DB" } },
      bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
      right: { style: "thin", color: { argb: "FFD1D5DB" } },
    };
    ws.getColumn(colIndex).width = COL_WIDTHS[colIndex - 1];
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  businesses.forEach((b, i) => {
    const row = ws.addRow([
      b.name,
      b.zone,
      b.keyword,
      b.address,
      b.mapsPhone,
      b.website,
      b.emails.join("; "),
      b.webPhones.join("; "),
      b.rating || "",
      b.category,
      STATUS_LABEL[b.status] ?? b.status,
      PRIORITY_LABEL[b.priority] ?? b.priority,
      b.contactName,
      b.contactRole,
      b.tags.join(", "),
      b.nextFollowUpAt ? b.nextFollowUpAt.toISOString().slice(0, 10) : "",
      b.lastCalledAt ? b.lastCalledAt.toISOString().slice(0, 10) : "",
      b.assignedTo?.name ?? "",
      b.product ? (PRODUCT_LABEL[b.product] ?? b.product) : "",
      b.dealValue || "",
      b.closedAt ? b.closedAt.toISOString().slice(0, 10) : "",
    ]);
    const fill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: i % 2 === 0 ? "FFEFF6FF" : "FFFFFFFF" },
    };
    row.eachCell((cell) => {
      cell.font = { size: 10 };
      cell.fill = fill;
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD1D5DB" } },
        left: { style: "thin", color: { argb: "FFD1D5DB" } },
        bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
        right: { style: "thin", color: { argb: "FFD1D5DB" } },
      };
    });
  });

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="negocios_${ts}.xlsx"`,
    },
  });
}
