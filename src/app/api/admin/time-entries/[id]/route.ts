import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

const patchSchema = z.object({
  clockIn: z.string().datetime().optional(),
  // "" (string vacío) = dejar el fichaje abierto (borrar clockOut).
  clockOut: z.union([z.string().datetime(), z.literal("")]).optional(),
});

/** Corrige un fichaje (olvidado, mal cerrado...) — queda marcado como editado por el admin. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { clockIn, clockOut } = parsed.data;

  const nextClockIn = clockIn ? new Date(clockIn) : undefined;
  const nextClockOut = clockOut === "" ? null : clockOut ? new Date(clockOut) : undefined;

  if (nextClockIn && nextClockOut && nextClockOut <= nextClockIn) {
    return NextResponse.json({ error: "La hora de salida debe ser posterior a la de entrada" }, { status: 400 });
  }

  const entry = await prisma.timeEntry.update({
    where: { id },
    data: {
      ...(nextClockIn && { clockIn: nextClockIn }),
      ...(nextClockOut !== undefined && { clockOut: nextClockOut }),
      editedByAdmin: true,
    },
  });

  return NextResponse.json(entry);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  await prisma.timeEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
