import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { runTaskStep } from "@/lib/scraper/task-step";

// Playwright necesita Node.js (no edge); cada paso está acotado mentalmente
// a ~20-25s de trabajo real, con margen hasta el límite del plan de Vercel.
export const runtime = "nodejs";
export const maxDuration = 60;

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
