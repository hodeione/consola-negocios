import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export interface ConversionRow {
  label: string;
  total: number;
  customers: number;
  conversionPct: number;
  revenue: number;
  avgDealValue: number;
}

/**
 * Tasa de cierre agrupada por zona o por keyword — para saber qué segmentos
 * convierten mejor de verdad (no solo intuición) y decidir dónde merece la
 * pena seguir scrapeando. Conecta con la charla de estrategia comercial del
 * principio: "¿esos negocios son los que más venden?" — ahora se puede
 * responder con datos reales en vez de a ojo.
 */
export async function getConversionByField(
  field: "zone" | "keyword",
  scopeWhere: Prisma.BusinessWhereInput
): Promise<ConversionRow[]> {
  const [totals, customers] = await Promise.all([
    prisma.business.groupBy({
      by: [field],
      where: scopeWhere,
      _count: { _all: true },
    }),
    prisma.business.groupBy({
      by: [field],
      where: { ...scopeWhere, status: "CUSTOMER" },
      _count: { _all: true },
      _sum: { dealValue: true },
    }),
  ]);

  const customersByLabel = new Map(customers.map((c) => [c[field], c]));

  return totals
    .map((t) => {
      const label = t[field] || "(sin especificar)";
      const c = customersByLabel.get(t[field]);
      const customerCount = c?._count._all ?? 0;
      const revenue = c?._sum.dealValue ?? 0;
      return {
        label,
        total: t._count._all,
        customers: customerCount,
        conversionPct: t._count._all > 0 ? Math.round((customerCount / t._count._all) * 1000) / 10 : 0,
        revenue,
        avgDealValue: customerCount > 0 ? Math.round((revenue / customerCount) * 100) / 100 : 0,
      };
    })
    .filter((r) => r.total >= 3) // descarta zonas/keywords con muestra demasiado pequeña para significar algo
    .sort((a, b) => b.conversionPct - a.conversionPct);
}
