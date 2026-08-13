import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { cancelTask } from "@/lib/scraper/task-step";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  try {
    const task = await cancelTask(id, user.id, user.role === "ADMIN");
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
