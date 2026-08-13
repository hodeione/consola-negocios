import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { redirect } from "next/navigation";
import { ScrapeConsole } from "@/components/scrape-console";

export default async function ScrapePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const batchJobs = await prisma.batchJob.findMany({
    where: user.role === "ADMIN" ? {} : { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { tasks: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <ScrapeConsole initialBatchJobs={batchJobs} />
    </div>
  );
}
