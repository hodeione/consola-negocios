import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere, parseBusinessFilters } from "@/lib/businesses/filters";
import type { Prisma } from "@/generated/prisma/client";

export const maxDuration = 60;

const CALL_STATUS = [
  "PENDING",
  "NO_ANSWER",
  "CALLBACK_LATER",
  "INTERESTED",
  "NOT_INTERESTED",
  "CUSTOMER",
  "INVALID_NUMBER",
] as const;
const PRIORITY = ["LOW", "MEDIUM", "HIGH"] as const;
const SORTABLE = new Set(["createdAt", "updatedAt", "name", "zone", "status", "priority", "nextFollowUpAt", "lastCalledAt", "rating", "digitalNeedScore"]);

// Límite duro de seguridad: aunque no se pida `limit`, nunca tocamos más de
// esto en una sola llamada — evita que un filtro demasiado amplio (o vacío)
// reasigne de golpe toda la base por error.
const HARD_CAP = 5000;

const bodySchema = z.object({
  status: z.enum(CALL_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  assignedToUserId: z.string().nullable().optional(),
  addTag: z.string().trim().min(1).max(40).optional(),
  limit: z.number().int().min(1).max(HARD_CAP).optional(),
});

// Como "Asignar en lote" pero operando sobre TODO lo que cumple el filtro
// actual en vez de una selección de checkboxes — necesario porque la tabla
// solo permite marcar la página visible (50), y mover cientos/miles de
// negocios a mano no es viable.
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  // Solo ADMIN: es una acción que puede tocar cientos/miles de negocios de
  // una vez sin confirmación fila a fila, igual de sensible que reasignar.
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador puede usar esta acción" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { status, priority, assignedToUserId, addTag, limit } = parsed.data;

  if (!status && !priority && assignedToUserId === undefined && !addTag) {
    return NextResponse.json({ error: "Nada que aplicar" }, { status: 400 });
  }

  const sp = request.nextUrl.searchParams;
  const filters = parseBusinessFilters(sp);
  const where = buildBusinessWhere(filters, user);

  // Guarda de seguridad: exige al menos un criterio de filtro real (no solo
  // paginación/orden) — sin esto, un clic sin filtros aplicados movería la
  // base entera de golpe.
  const hasRealFilter =
    !!filters.status?.length ||
    !!filters.priority?.length ||
    !!filters.zone ||
    !!filters.keyword ||
    !!filters.tag ||
    !!filters.assignedTo ||
    !!filters.search ||
    !!filters.dueBefore ||
    !!filters.staleBefore ||
    filters.maxRating !== undefined ||
    filters.minDigitalNeed !== undefined;
  if (!hasRealFilter) {
    return NextResponse.json({ error: "Selecciona al menos un filtro antes de aplicar a todos" }, { status: 400 });
  }

  const sortByRaw = sp.get("sortBy") || "createdAt";
  const sortBy = SORTABLE.has(sortByRaw) ? sortByRaw : "createdAt";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  const orderBy = { [sortBy]: sortDir } as Prisma.BusinessOrderByWithRelationInput;

  const rows = await prisma.business.findMany({
    where,
    select: { id: true, tags: true },
    orderBy,
    take: limit ?? HARD_CAP,
  });

  if (rows.length === 0) return NextResponse.json({ updated: 0, matched: 0 });

  const ids = rows.map((r) => r.id);
  const fieldPatch: Prisma.BusinessUncheckedUpdateManyInput = {};
  if (status) fieldPatch.status = status;
  if (priority) fieldPatch.priority = priority;
  if (assignedToUserId !== undefined) fieldPatch.assignedToUserId = assignedToUserId;

  let updatedCount = 0;
  const auditRows: { businessId: string; userId: string; action: string; detail: string }[] = [];
  const targetLabel =
    assignedToUserId === undefined
      ? null
      : assignedToUserId
        ? ((await prisma.user.findUnique({ where: { id: assignedToUserId }, select: { name: true } }))?.name ?? assignedToUserId)
        : "sin asignar";

  if (Object.keys(fieldPatch).length > 0) {
    const res = await prisma.business.updateMany({ where: { id: { in: ids } }, data: fieldPatch });
    updatedCount = res.count;
    for (const id of ids) {
      if (priority) auditRows.push({ businessId: id, userId: user.id, action: "priority_changed", detail: `acción por filtro → ${priority}` });
      if (status) auditRows.push({ businessId: id, userId: user.id, action: "status_changed", detail: `acción por filtro → ${status}` });
      if (targetLabel !== null) auditRows.push({ businessId: id, userId: user.id, action: "reassigned", detail: `acción por filtro → ${targetLabel}` });
    }
  }

  if (addTag) {
    await Promise.all(
      rows
        .filter((r) => !r.tags.includes(addTag))
        .map((r) => prisma.business.update({ where: { id: r.id }, data: { tags: { push: addTag } } }))
    );
    updatedCount = Math.max(updatedCount, rows.length);
    for (const id of ids) {
      auditRows.push({ businessId: id, userId: user.id, action: "tags_changed", detail: `+ ${addTag} (por filtro)` });
    }
  }

  if (auditRows.length > 0) {
    await prisma.auditLog.createMany({ data: auditRows });
  }

  return NextResponse.json({ updated: updatedCount, matched: rows.length });
}
