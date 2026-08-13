/**
 * Orquestación de un "paso" de una ScrapeTask. Cada llamada hace una
 * porción acotada de trabajo (pensada para caber en una función serverless)
 * y persiste el progreso en `ScrapeTask.cursor` para poder reanudar en la
 * siguiente llamada. El cliente (navegador) llama a este paso en bucle
 * hasta que el estado es DONE / ERROR / CANCELLED.
 *
 * Etapas: PENDING → COLLECTING (enlaces de Maps) → DETAILING (ficha de cada
 * lugar) → ENRICHING (emails/teléfonos de la web de cada negocio) → DONE.
 */
import { prisma } from "@/lib/prisma";
import { collectPlaceLinksStep, detailPlacesBatch, type PlaceDetails } from "./maps";
import { fetchContactInfo } from "./contact-extract";
import { buildDedupeKey } from "./dedupe";
import type { ScrapeTask } from "@/generated/prisma/client";
import type { ScrapeTaskUpdateInput } from "@/generated/prisma/models/ScrapeTask";

type TaskPatch = ScrapeTaskUpdateInput;

const DETAIL_BATCH = 12;
const ENRICH_BATCH = 15;
const COLLECT_TIME_BUDGET_MS = 20000;

interface CollectingCursor {
  links: string[];
}
interface DetailingCursor {
  links: string[];
  details: PlaceDetails[];
  nextIndex: number;
}
interface EnrichingCursor {
  details: PlaceDetails[];
  nextIndex: number;
  savedCount: number;
}

function asCollecting(cursor: unknown): CollectingCursor {
  const c = cursor as Partial<CollectingCursor> | null;
  return { links: c?.links ?? [] };
}
function asDetailing(cursor: unknown): DetailingCursor {
  const c = cursor as Partial<DetailingCursor> | null;
  return { links: c?.links ?? [], details: c?.details ?? [], nextIndex: c?.nextIndex ?? 0 };
}
function asEnriching(cursor: unknown): EnrichingCursor {
  const c = cursor as Partial<EnrichingCursor> | null;
  return { details: c?.details ?? [], nextIndex: c?.nextIndex ?? 0, savedCount: c?.savedCount ?? 0 };
}

/** Convierte una ficha de Maps en los campos "scrapeados" de un Business. */
function placeToBusinessFields(detail: PlaceDetails, task: ScrapeTask) {
  return {
    name: detail.name,
    address: detail.address,
    mapsPhone: detail.phone,
    website: detail.website,
    rating: detail.rating,
    category: detail.category,
    zone: task.zone,
    keyword: task.keyword || "(zona)",
  };
}

async function saveBusinessIfHasContact(
  detail: PlaceDetails,
  task: ScrapeTask,
  emails: string[],
  webPhones: string[]
): Promise<boolean> {
  const hasContact = !!detail.phone || emails.length > 0 || webPhones.length > 0;
  if (!detail.name || !hasContact) return false;

  const dedupeKey = buildDedupeKey({ website: detail.website, phone: detail.phone, name: detail.name });
  const fields = placeToBusinessFields(detail, task);

  await prisma.business.upsert({
    where: { ownerId_dedupeKey: { ownerId: task.ownerId, dedupeKey } },
    create: {
      ...fields,
      emails,
      webPhones,
      dedupeKey,
      ownerId: task.ownerId,
      assignedToUserId: task.ownerId,
      sourceTaskId: task.id,
    },
    // No tocamos los campos de gestión (status, prioridad, notas, etiquetas...)
    // si el negocio ya existía de una búsqueda anterior.
    update: {
      ...fields,
      emails,
      webPhones,
      sourceTaskId: task.id,
    },
  });
  return true;
}

async function runCollecting(task: ScrapeTask): Promise<TaskPatch> {
  const cursor = asCollecting(task.cursor);
  const result = await collectPlaceLinksStep({
    keyword: task.keyword,
    zone: task.zone,
    language: task.language,
    maxResults: task.maxResults,
    alreadyKnown: cursor.links,
    timeBudgetMs: COLLECT_TIME_BUDGET_MS,
  });

  const feedExhausted = result.noNewStreak >= 4 || !result.feedFound;
  const reachedMax = result.links.length >= task.maxResults;

  if (feedExhausted || reachedMax) {
    const nextCursor: DetailingCursor = { links: result.links, details: [], nextIndex: 0 };
    return {
      status: "DETAILING",
      cursor: nextCursor as unknown as TaskPatch["cursor"],
      totalCount: result.links.length,
      message: `${result.links.length} lugares encontrados. Visitando fichas…`,
    };
  }

  const nextCursor: CollectingCursor = { links: result.links };
  return {
    status: "COLLECTING",
    cursor: nextCursor as unknown as TaskPatch["cursor"],
    totalCount: result.links.length,
    message: `Buscando en Maps… ${result.links.length} lugares encontrados`,
  };
}

async function runDetailing(task: ScrapeTask): Promise<TaskPatch> {
  const cursor = asDetailing(task.cursor);
  const batch = cursor.links.slice(cursor.nextIndex, cursor.nextIndex + DETAIL_BATCH);
  const newDetails = await detailPlacesBatch(batch, task.language);
  const details = [...cursor.details, ...newDetails];
  const nextIndex = cursor.nextIndex + batch.length;

  if (nextIndex >= cursor.links.length) {
    const nextCursor: EnrichingCursor = { details, nextIndex: 0, savedCount: 0 };
    return {
      status: "ENRICHING",
      cursor: nextCursor as unknown as TaskPatch["cursor"],
      message: `${details.length} fichas leídas. Buscando emails y teléfonos…`,
    };
  }

  const nextCursor: DetailingCursor = { links: cursor.links, details, nextIndex };
  return {
    status: "DETAILING",
    cursor: nextCursor as unknown as TaskPatch["cursor"],
    message: `Leyendo fichas… ${nextIndex}/${cursor.links.length}`,
  };
}

async function runEnriching(task: ScrapeTask): Promise<TaskPatch> {
  const cursor = asEnriching(task.cursor);
  const batch = cursor.details.slice(cursor.nextIndex, cursor.nextIndex + ENRICH_BATCH);

  let savedThisBatch = 0;
  await Promise.all(
    batch.map(async (detail) => {
      const { emails, webPhones } = detail.website
        ? await fetchContactInfo(detail.website)
        : { emails: [], webPhones: [] };
      const saved = await saveBusinessIfHasContact(detail, task, emails, webPhones);
      if (saved) savedThisBatch++;
    })
  );

  const nextIndex = cursor.nextIndex + batch.length;
  const savedCount = cursor.savedCount + savedThisBatch;

  if (nextIndex >= cursor.details.length) {
    return {
      status: "DONE",
      cursor: { details: [], nextIndex, savedCount } as unknown as TaskPatch["cursor"],
      foundCount: savedCount,
      message:
        savedCount > 0
          ? `Completado — ${savedCount} negocios con contacto guardados.`
          : "Completado — ningún negocio con datos de contacto.",
    };
  }

  const nextCursor: EnrichingCursor = { details: cursor.details, nextIndex, savedCount };
  return {
    status: "ENRICHING",
    cursor: nextCursor as unknown as TaskPatch["cursor"],
    foundCount: savedCount,
    message: `Extrayendo contacto… ${nextIndex}/${cursor.details.length} · ${savedCount} guardados`,
  };
}

/**
 * Ejecuta un paso acotado de la tarea `taskId` y persiste el progreso.
 * Lanza si la tarea no existe o no pertenece a `userId` (salvo `isAdmin`).
 */
export async function runTaskStep(
  taskId: string,
  userId: string,
  isAdmin: boolean
): Promise<ScrapeTask> {
  const task = await prisma.scrapeTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("NOT_FOUND");
  if (!isAdmin && task.ownerId !== userId) throw new Error("FORBIDDEN");

  if (task.status === "DONE" || task.status === "ERROR" || task.status === "CANCELLED") {
    return task;
  }

  try {
    let patch: TaskPatch;
    switch (task.status) {
      case "PENDING":
        patch = {
          status: "COLLECTING",
          cursor: { links: [] } as unknown as TaskPatch["cursor"],
          message: "Iniciando búsqueda en Maps…",
        };
        break;
      case "COLLECTING":
        patch = await runCollecting(task);
        break;
      case "DETAILING":
        patch = await runDetailing(task);
        break;
      case "ENRICHING":
        patch = await runEnriching(task);
        break;
      default:
        patch = {};
    }

    return await prisma.scrapeTask.update({ where: { id: taskId }, data: patch });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return prisma.scrapeTask.update({
      where: { id: taskId },
      data: { status: "ERROR", error: message, message: `Error: ${message}` },
    });
  }
}

export async function cancelTask(
  taskId: string,
  userId: string,
  isAdmin: boolean
): Promise<ScrapeTask> {
  const task = await prisma.scrapeTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("NOT_FOUND");
  if (!isAdmin && task.ownerId !== userId) throw new Error("FORBIDDEN");
  if (task.status === "DONE" || task.status === "ERROR" || task.status === "CANCELLED") {
    return task;
  }

  return prisma.scrapeTask.update({
    where: { id: taskId },
    data: { status: "CANCELLED", message: "Cancelado por el usuario." },
  });
}
