import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/api-auth";
import { getAgentStats, defaultRange } from "@/lib/admin-stats";
import { prisma } from "@/lib/prisma";
import { AdminStatsConsole } from "@/components/admin-stats-console";

export default async function AdminStatsPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/businesses");

  const { from, to } = defaultRange(7);
  const [agents, openEntries] = await Promise.all([
    getAgentStats(from, to),
    prisma.timeEntry.findMany({
      where: { clockOut: null },
      orderBy: { clockIn: "desc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
  ]);

  return (
    <AdminStatsConsole
      initialAgents={agents}
      initialRange={{ from: from.toISOString(), to: to.toISOString() }}
      initialOpenEntries={openEntries.map((e) => ({
        ...e,
        clockIn: e.clockIn.toISOString(),
        clockOut: e.clockOut ? e.clockOut.toISOString() : null,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      }))}
    />
  );
}
