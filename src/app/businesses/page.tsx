import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere } from "@/lib/businesses/filters";
import { BusinessesConsole } from "@/components/businesses-console";

const PAGE_SIZE = 50;

export default async function BusinessesPage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const where = buildBusinessWhere({}, user);

  const [items, total, stats, keywordsRaw, assignableUsers] = await Promise.all([
    prisma.business.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      include: { assignedTo: { select: { id: true, name: true } } },
    }),
    prisma.business.count({ where }),
    prisma.business.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.business.groupBy({
      by: ["keyword"],
      where: { ...where, keyword: { not: "" } },
      _count: { _all: true },
      orderBy: { _count: { keyword: "desc" } },
    }),
    user.role === "ADMIN"
      ? prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const byStatus = Object.fromEntries(stats.map((s) => [s.status, s._count._all]));
  const keywords = keywordsRaw.map((k) => k.keyword);

  return (
    <BusinessesConsole
      initialItems={items}
      initialTotal={total}
      initialStats={{ total, byStatus, keywords }}
      pageSize={PAGE_SIZE}
      isAdmin={user.role === "ADMIN"}
      assignableUsers={assignableUsers}
    />
  );
}
