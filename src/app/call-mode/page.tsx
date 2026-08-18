import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere } from "@/lib/businesses/filters";
import { CallModeConsole } from "@/components/call-mode-console";

export default async function CallModePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const where = buildBusinessWhere({}, user);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  // Misma cola que "Toca llamar hoy" del dashboard, pero sin el tope de 5 y
  // con todos los campos que hacen falta para ver la ficha entera sin tener
  // que pedir nada más al avanzar de un negocio al siguiente.
  const queue = await prisma.business.findMany({
    where: { ...where, nextFollowUpAt: { lte: endOfToday } },
    orderBy: { nextFollowUpAt: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      address: true,
      mapsPhone: true,
      webPhones: true,
      website: true,
      emails: true,
      rating: true,
      category: true,
      zone: true,
      keyword: true,
      status: true,
      priority: true,
      contactName: true,
      contactRole: true,
      tags: true,
    },
  });

  return <CallModeConsole initialQueue={queue} />;
}
