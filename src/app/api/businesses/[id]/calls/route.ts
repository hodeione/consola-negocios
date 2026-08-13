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

const bodySchema = z.object({
  outcome: z.enum(CALL_STATUS),
  notes: z.string().max(2000).default(""),
  // Si se manda, fija (o borra, con null) la próxima fecha de seguimiento.
  // Si se omite, no se toca.
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});

function canAccess(business: { assignedToUserId: string | null; ownerId: string }, user: { id: string; role: string }) {
  if (user.role === "ADMIN") return true;
  return business.assignedToUserId === user.id || business.ownerId === user.id;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const business = await prisma.business.findUnique({ where: { id } });
  if (!business) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  if (!canAccess(business, user)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { outcome, notes, nextFollowUpAt } = parsed.data;

  const [activity, updatedBusiness] = await prisma.$transaction([
    prisma.callActivity.create({
      data: { businessId: id, userId: user.id, outcome, notes },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.business.update({
      where: { id },
      data: {
        status: outcome,
        lastCalledAt: new Date(),
        ...(nextFollowUpAt !== undefined && {
          nextFollowUpAt: nextFollowUpAt ? new Date(nextFollowUpAt) : null,
        }),
      },
      include: { assignedTo: { select: { id: true, name: true } } },
    }),
  ]);

  return NextResponse.json({ activity, business: updatedBusiness }, { status: 201 });
}
