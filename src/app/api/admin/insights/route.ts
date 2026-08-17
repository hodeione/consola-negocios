import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getConversionByField } from "@/lib/insights";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });

  const field = request.nextUrl.searchParams.get("field") === "keyword" ? "keyword" : "zone";
  const rows = await getConversionByField(field, {});
  return NextResponse.json({ field, rows });
}
