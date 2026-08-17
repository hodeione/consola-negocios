import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function POST() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const alreadyOpen = await prisma.timeEntry.findFirst({
    where: { userId: user.id, clockOut: null },
  });
  if (alreadyOpen) {
    return NextResponse.json({ error: "Ya tienes un fichaje abierto" }, { status: 409 });
  }

  const entry = await prisma.timeEntry.create({ data: { userId: user.id } });
  return NextResponse.json(entry, { status: 201 });
}
