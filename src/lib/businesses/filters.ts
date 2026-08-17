import type { Prisma } from "@/generated/prisma/client";
import type { CallStatus, Priority } from "@/generated/prisma/enums";

const CALL_STATUSES = [
  "PENDING",
  "NO_ANSWER",
  "CALLBACK_LATER",
  "INTERESTED",
  "NOT_INTERESTED",
  "CUSTOMER",
  "INVALID_NUMBER",
] as const;
const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;

export interface BusinessFilters {
  status?: CallStatus[];
  priority?: Priority[];
  zone?: string;
  keyword?: string;
  tag?: string;
  assignedTo?: string; // userId | "me" | "unassigned"
  search?: string;
  dueBefore?: Date;
  batchJobId?: string;
  // Solo negocios cuyo lastVerifiedAt sea anterior a esta fecha — "datos desactualizados".
  staleBefore?: Date;
}

function parseCsv<T extends string>(value: string | null, allowed: readonly T[]): T[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").filter((v): v is T => (allowed as readonly string[]).includes(v));
  return parts.length ? parts : undefined;
}

export function parseBusinessFilters(searchParams: URLSearchParams): BusinessFilters {
  const dueBeforeRaw = searchParams.get("dueBefore");
  const dueBefore = dueBeforeRaw ? new Date(dueBeforeRaw) : undefined;
  const staleBeforeRaw = searchParams.get("staleBefore");
  const staleBefore = staleBeforeRaw ? new Date(staleBeforeRaw) : undefined;

  return {
    status: parseCsv(searchParams.get("status"), CALL_STATUSES),
    priority: parseCsv(searchParams.get("priority"), PRIORITIES),
    zone: searchParams.get("zone")?.trim() || undefined,
    keyword: searchParams.get("keyword")?.trim() || undefined,
    tag: searchParams.get("tag")?.trim() || undefined,
    assignedTo: searchParams.get("assignedTo")?.trim() || undefined,
    search: searchParams.get("search")?.trim() || undefined,
    dueBefore: dueBefore && !isNaN(dueBefore.getTime()) ? dueBefore : undefined,
    batchJobId: searchParams.get("batchJobId")?.trim() || undefined,
    staleBefore: staleBefore && !isNaN(staleBefore.getTime()) ? staleBefore : undefined,
  };
}

/**
 * Construye el `where` de Prisma respetando visibilidad por rol: un AGENT
 * sólo ve lo que tiene asignado; un ADMIN ve todo y puede además filtrar
 * por `assignedTo`.
 */
export function buildBusinessWhere(
  filters: BusinessFilters,
  user: { id: string; role: string }
): Prisma.BusinessWhereInput {
  const where: Prisma.BusinessWhereInput = {};

  if (user.role !== "ADMIN") {
    where.assignedToUserId = user.id;
  } else if (filters.assignedTo === "unassigned") {
    where.assignedToUserId = null;
  } else if (filters.assignedTo === "me") {
    where.assignedToUserId = user.id;
  } else if (filters.assignedTo) {
    where.assignedToUserId = filters.assignedTo;
  }

  if (filters.status?.length) where.status = { in: filters.status };
  if (filters.priority?.length) where.priority = { in: filters.priority };
  if (filters.zone) where.zone = { equals: filters.zone, mode: "insensitive" };
  if (filters.keyword) where.keyword = { equals: filters.keyword, mode: "insensitive" };
  if (filters.tag) where.tags = { has: filters.tag };
  if (filters.batchJobId) where.sourceTask = { batchJobId: filters.batchJobId };
  if (filters.dueBefore) where.nextFollowUpAt = { lte: filters.dueBefore };
  if (filters.staleBefore) where.lastVerifiedAt = { lte: filters.staleBefore };

  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: "insensitive" } },
      { address: { contains: filters.search, mode: "insensitive" } },
      { website: { contains: filters.search, mode: "insensitive" } },
      { contactName: { contains: filters.search, mode: "insensitive" } },
      { emails: { has: filters.search.toLowerCase() } },
    ];
  }

  return where;
}
