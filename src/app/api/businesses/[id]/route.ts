import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

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
const PRODUCT = ["LANDING", "SEO", "ECOMMERCE", "SAAS", "CUSTOM", "OTHER"] as const;

const patchSchema = z.object({
  status: z.enum(CALL_STATUS).optional(),
  priority: z.enum(PRIORITY).optional(),
  contactName: z.string().max(120).optional(),
  contactRole: z.string().max(120).optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
  assignedToUserId: z.string().nullable().optional(),
  dealValue: z.number().min(0).max(10_000_000).optional(),
  product: z.enum(PRODUCT).nullable().optional(),
  closedAt: z.string().datetime().nullable().optional(),
});

function canAccess(business: { assignedToUserId: string | null; ownerId: string }, user: { id: string; role: string }) {
  if (user.role === "ADMIN") return true;
  return business.assignedToUserId === user.id || business.ownerId === user.id;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      callActivities: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!canAccess(business, user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  return NextResponse.json(business);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const business = await prisma.business.findUnique({
    where: { id },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!canAccess(business, user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { assignedToUserId, nextFollowUpAt, closedAt, ...rest } = parsed.data;
  if (assignedToUserId !== undefined && user.role !== "ADMIN") {
    return NextResponse.json({ error: "Sólo un administrador puede reasignar" }, { status: 403 });
  }

  // Auditoría: compara antes de escribir, para saber qué cambió de verdad.
  const auditEntries: { action: string; detail: string }[] = [];
  if (assignedToUserId !== undefined && assignedToUserId !== business.assignedToUserId) {
    const fromLabel = business.assignedTo?.name ?? "sin asignar";
    const toLabel = assignedToUserId
      ? (await prisma.user.findUnique({ where: { id: assignedToUserId }, select: { name: true } }))?.name ?? assignedToUserId
      : "sin asignar";
    auditEntries.push({ action: "reassigned", detail: `de ${fromLabel} a ${toLabel}` });
  }
  if (rest.priority && rest.priority !== business.priority) {
    auditEntries.push({ action: "priority_changed", detail: `${business.priority} → ${rest.priority}` });
  }
  if (rest.status && rest.status !== business.status) {
    auditEntries.push({ action: "status_changed", detail: `${business.status} → ${rest.status}` });
  }
  if (rest.tags && JSON.stringify([...rest.tags].sort()) !== JSON.stringify([...business.tags].sort())) {
    auditEntries.push({ action: "tags_changed", detail: rest.tags.join(", ") || "(sin etiquetas)" });
  }

  const updated = await prisma.business.update({
    where: { id },
    data: {
      ...rest,
      ...(nextFollowUpAt !== undefined && { nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null }),
      ...(closedAt !== undefined && { closedAt: closedAt ? new Date(closedAt) : null }),
      ...(assignedToUserId !== undefined && { assignedToUserId }),
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  if (auditEntries.length > 0) {
    await prisma.auditLog.createMany({
      data: auditEntries.map((e) => ({ businessId: id, userId: user.id, action: e.action, detail: e.detail })),
    });
  }

  return NextResponse.json(updated);
}
