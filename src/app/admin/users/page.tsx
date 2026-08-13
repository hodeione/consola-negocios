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

  return <AdminUsersConsole initialUsers={users} currentUserId={admin.id} />;
}
