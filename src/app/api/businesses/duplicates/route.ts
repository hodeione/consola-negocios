import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api-auth";
import { findPossibleDuplicates } from "@/lib/duplicates";

export async function GET() {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  // Mismo criterio de visibilidad que el resto: un AGENT solo ve duplicados
  // dentro de su propia cartera, el ADMIN los ve todos.
  const scopeWhere = user.role === "ADMIN" ? {} : { assignedToUserId: user.id };
  const groups = await findPossibleDuplicates(scopeWhere);

  return NextResponse.json({ groups });
}
