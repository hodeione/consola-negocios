import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const events = await prisma.loginEvent.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json(events);
}
