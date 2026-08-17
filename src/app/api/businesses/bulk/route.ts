import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import type { Prisma } from "@/generated/prisma/client";

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

const bodySchema = z.object({
  ids: z.array(z.string()).min(1).max(500),
  status: z.enum(CALL_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  assignedToUserId: z.string().nullable().optional(),
  addTag: z.string().trim().min(1).max(40).optional(),
});

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { ids, status, priority, assignedToUserId, addTag } = parsed.data;

  if (assignedToUserId !== undefined && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sólo un administrador puede reasignar" }, { status: 403 });
  }

  // Restringe a lo que este usuario puede ver/editar (un AGENT no puede tocar negocios ajenos).
  const scopeWhere: Prisma.BusinessWhereInput =
    user.role === "ADMIN" ? {} : { assignedToUserId: user.id };

  const visibleIds = (
    await prisma.business.findMany({
      where: { id: { in: ids }, ...scopeWhere },
      select: { id: true, tags: true },
    })
  );
  if (visibleIds.length === 0) {
    return NextResponse.json({ error: "Ningún negocio visible con esos ids" }, { status: 404 });
  }

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
    const res = await prisma.business.updateMany({
      where: { id: { in: visibleIds.map((b) => b.id) } },
      data: fieldPatch,
    });
    updatedCount = res.count;

    for (const b of visibleIds) {
      if (priority) auditRows.push({ businessId: b.id, userId: user.id, action: "priority_changed", detail: `acción en lote → ${priority}` });
      if (status) auditRows.push({ businessId: b.id, userId: user.id, action: "status_changed", detail: `acción en lote → ${status}` });
      if (targetLabel !== null) auditRows.push({ businessId: b.id, userId: user.id, action: "reassigned", detail: `acción en lote → ${targetLabel}` });
    }
  }

  if (addTag) {
    await Promise.all(
      visibleIds
        .filter((b) => !b.tags.includes(addTag))
        .map((b) =>
          prisma.business.update({
            where: { id: b.id },
            data: { tags: { push: addTag } },
          })
        )
    );
    updatedCount = Math.max(updatedCount, visibleIds.length);
    for (const b of visibleIds) {
      auditRows.push({ businessId: b.id, userId: user.id, action: "tags_changed", detail: `+ ${addTag} (lote)` });
    }
  }

  if (auditRows.length > 0) {
    await prisma.auditLog.createMany({ data: auditRows });
  }

  return NextResponse.json({ updated: updatedCount });
}
