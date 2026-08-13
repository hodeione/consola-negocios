import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "AGENT"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { name, role, active, password } = parsed.data;

  // Evita que un admin se quite a sí mismo el rol o el acceso y se quede fuera.
  if (id === admin.id && ((role && role !== "ADMIN") || active === false)) {
    return NextResponse.json(
      { error: "No puedes quitarte a ti mismo el rol de administrador o el acceso" },
      { status: 400 }
    );
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  const user = await prisma.user.update({
    where: { id },
    data: { name, role, active, ...(passwordHash && { passwordHash }) },
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json(user);
}
