import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

const TYPE_LABEL: Record<string, string> = { WORK: "Trabajo", VACATION: "Vacaciones", ABSENCE: "Ausencia" };

/** Excel de fichajes en un rango — para pasar a nómina. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const fromRaw = sp.get("from");
  const toRaw = sp.get("to");
  const from = fromRaw && !isNaN(Date.parse(fromRaw)) ? new Date(fromRaw) : new Date(Date.now() - 30 * 86_400_000);
  const to = toRaw && !isNaN(Date.parse(toRaw)) ? new Date(toRaw) : new Date();

  const entries = await prisma.timeEntry.findMany({
    where: { clockIn: { gte: from, lte: to } },
    orderBy: [{ userId: "asc" }, { clockIn: "asc" }],
    include: { user: { select: { name: true, email: true } } },
  });

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Fichajes");
  const headers = ["Persona", "Email", "Tipo", "Entrada", "Salida", "Horas", "Nota", "Editado por admin"];
  const headerRow = ws.addRow(headers);
  headerRow.eachCell((cell, colIndex) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(colIndex).width = [24, 26, 14, 20, 20, 10, 30, 12][colIndex - 1];
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  entries.forEach((e, i) => {
    const hours = e.clockOut ? (e.clockOut.getTime() - e.clockIn.getTime()) / 3_600_000 : 0;
    const row = ws.addRow([
      e.user.name,
      e.user.email,
      TYPE_LABEL[e.type] ?? e.type,
      e.clockIn.toLocaleString("es-ES"),
      e.clockOut ? e.clockOut.toLocaleString("es-ES") : "(abierto)",
      e.clockOut ? Math.round(hours * 100) / 100 : "",
      e.note,
      e.editedByAdmin ? "Sí" : "",
    ]);
    const fill: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFEFF6FF" : "FFFFFFFF" } };
    row.eachCell((cell) => {
      cell.font = { size: 10 };
      cell.fill = fill;
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const buffer = await wb.xlsx.writeBuffer();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="fichajes_${ts}.xlsx"`,
    },
  });
}
