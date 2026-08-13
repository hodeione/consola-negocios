import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const batchJobId = request.nextUrl.searchParams.get("batchJobId") || undefined;

  const tasks = await prisma.scrapeTask.findMany({
    where: {
      ...(user.role === "ADMIN" ? {} : { ownerId: user.id }),
      ...(batchJobId ? { batchJobId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(tasks);
}
