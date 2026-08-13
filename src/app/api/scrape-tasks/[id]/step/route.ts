import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { runTaskStep } from "@/lib/scraper/task-step";

// Playwright necesita Node.js (no edge). Con los tamaños de lote actuales el
// trabajo real está pensado para acabar en ~30-55s, pero se deja margen
// hasta 90s por si Google Maps responde lento o hay cold start de Chromium
// — visto en producción que a 60s justos alguna tarea se cortaba a mitad.
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  try {
    const task = await runTaskStep(id, user.id, user.role === "ADMIN");
    return NextResponse.json(task);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }
    if (err instanceof Error && err.message === "FORBIDDEN") {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    throw err;
  }
}
