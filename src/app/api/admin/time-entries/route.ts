import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

/** Lista de fichajes recientes, para revisar/corregir olvidos. */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const userId = sp.get("userId") || undefined;
  const onlyOpen = sp.get("onlyOpen") === "true";

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId,
      ...(onlyOpen ? { clockOut: null } : {}),
    },
    orderBy: { clockIn: "desc" },
    take: 100,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json(entries);
}

const createSchema = z.object({
  userId: z.string(),
  type: z.enum(["VACATION", "ABSENCE"]),
  clockIn: z.string().datetime(),
  clockOut: z.string().datetime(),
  note: z.string().max(200).optional(),
});

/** El admin registra vacaciones/ausencia de alguien — un rango ya cerrado,
 * no un fichaje en curso. No cuenta como horas trabajadas ni entra en la
 * detección de inactividad (ver src/lib/admin-stats.ts). */
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { userId, type, clockIn, clockOut, note } = parsed.data;

  if (new Date(clockOut) <= new Date(clockIn)) {
    return NextResponse.json({ error: "La fecha de fin debe ser posterior a la de inicio" }, { status: 400 });
  }

  const entry = await prisma.timeEntry.create({
    data: { userId, type, clockIn: new Date(clockIn), clockOut: new Date(clockOut), note: note || "", editedByAdmin: true },
    include: { user: { select: { id: true, name: true, email: true } } },
  });
  return NextResponse.json(entry, { status: 201 });
}
