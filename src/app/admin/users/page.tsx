import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";
import { AdminUsersConsole } from "@/components/admin-users-console";

export default async function AdminUsersPage() {
  const admin = await requireAdmin();
  if (!admin) redirect("/businesses");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
      _count: { select: { assignedBusiness: true } },
    },
  });

  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - 90);

  const [lastTask, openEntries, staleCount, totalBusinesses] = await Promise.all([
    prisma.scrapeTask.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true, zone: true, keyword: true, status: true } }),
    prisma.timeEntry.count({ where: { clockOut: null, type: "WORK" } }),
    prisma.business.count({ where: { lastVerifiedAt: { lte: staleCutoff } } }),
    prisma.business.count(),
  ]);

  const health = {
    lastTask: lastTask
      ? { updatedAt: lastTask.updatedAt.toISOString(), label: `${lastTask.keyword || "(zona)"} · ${lastTask.zone}`, status: lastTask.status }
      : null,
    openEntries,
    staleCount,
    totalBusinesses,
    scrapingEnabled: process.env.VERCEL ? process.env.SCRAPING_ENABLED === "true" : true,
    emailConfigured: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
    cronSecretConfigured: !!process.env.CRON_SECRET,
  };

  return <AdminUsersConsole initialUsers={users} currentUserId={admin.id} health={health} />;
}
