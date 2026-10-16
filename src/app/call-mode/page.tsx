import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere } from "@/lib/businesses/filters";
import { CallModeConsole } from "@/components/call-mode-console";
import { endOfTodayMadrid } from "@/lib/timezone";

export default async function CallModePage() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const where = buildBusinessWhere({}, user);
  const endOfToday = endOfTodayMadrid();

  // Primero "Toca llamar hoy" (como en el dashboard, sin el tope de 5) y luego
  // los nuevos sin llamar, con todos los campos que hacen falta para ver la
  // ficha entera sin pedir nada más al avanzar de un negocio al siguiente.
  const select = {
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
      digitalNeedSignals: true,
      legalOwnerName: true,
      legalOwnerType: true,
      webTech: true,
      webCopyrightYear: true,
      hasOnlineShop: true,
      hasOnlineBooking: true,
      socialLinks: true,
      webInsightsAt: true,
  } as const;

  const due = await prisma.business.findMany({
    where: { ...where, nextFollowUpAt: { lte: endOfToday } },
    orderBy: { nextFollowUpAt: "asc" },
    take: 200,
    select,
  });

  // Después de los seguimientos, los que aún no se han llamado nunca — los de
  // más necesidad digital primero (los "nuevos" del reparto diario entran aquí).
  const fresh = await prisma.business.findMany({
    where: {
      ...where,
      status: "PENDING",
      lastCalledAt: null,
      nextFollowUpAt: null,
      flaggedIncorrect: false,
      id: { notIn: due.map((b) => b.id) },
    },
    orderBy: [{ digitalNeedScore: "desc" }, { rating: "desc" }],
    take: Math.max(0, 200 - due.length),
    select,
  });

  return <CallModeConsole initialQueue={[...due, ...fresh]} />;
}
