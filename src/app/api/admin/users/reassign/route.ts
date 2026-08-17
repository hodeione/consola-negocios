import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

const bodySchema = z.object({
  fromUserId: z.string(),
  // null = dejar sin asignar
  toUserId: z.string().nullable(),
});

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { fromUserId, toUserId } = parsed.data;

  if (fromUserId === toUserId) {
    return NextResponse.json({ error: "Origen y destino no pueden ser el mismo" }, { status: 400 });
  }

  const [fromUser, toUser, affected] = await Promise.all([
    prisma.user.findUnique({ where: { id: fromUserId }, select: { name: true } }),
    toUserId ? prisma.user.findUnique({ where: { id: toUserId }, select: { name: true } }) : null,
    prisma.business.findMany({ where: { assignedToUserId: fromUserId }, select: { id: true } }),
  ]);

  const result = await prisma.business.updateMany({
    where: { assignedToUserId: fromUserId },
    data: { assignedToUserId: toUserId },
  });

  if (affected.length > 0) {
    const detail = `reasignación masiva: de ${fromUser?.name ?? fromUserId} a ${toUser?.name ?? "sin asignar"}`;
    await prisma.auditLog.createMany({
      data: affected.map((b) => ({ businessId: b.id, userId: admin.id, action: "reassigned", detail })),
    });
  }

  return NextResponse.json({ reassigned: result.count });
}
