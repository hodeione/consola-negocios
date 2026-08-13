/**
 * Scraping de Google Maps con Playwright — port de la lógica de
 * `scraperweb/scraper.py` (mismos selectores, mismo bucle de scroll).
 *
 * Cada función lanza su propio navegador (`launchBrowser()`) y lo cierra
 * por completo al terminar — cada paso de una tarea (una invocación de
 * función serverless) queda totalmente aislado del resto, así un fallo a
 * mitad nunca deja el navegador en un estado que arrastre al siguiente paso.
 */
import type { Page } from "playwright-core";
import { launchBrowser, DESKTOP_USER_AGENT } from "./browser";

export interface PlaceDetails {
  sourceUrl: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  category: string;
}

export function buildMapsSearchUrl(keyword: string, zone: string, language: string): string {
  const query = keyword ? `${keyword} ${zone}`.trim() : zone;
  return `https://www.google.com/maps/search/${encodeURIComponent(query)}?hl=${language}`;
}

const CONSENT_BUTTON_LABELS = ["Aceptar todo", "Accept all", "Accepter tout", "Alle akzeptieren"];

/**
 * Google intercala una pantalla de consentimiento (`consent.google.com`)
 * antes de servir tanto la búsqueda como cualquier ficha de lugar, en cada
 * contexto de navegador nuevo (sin cookies previas). Hay que comprobarla y
 * aceptarla tras CADA navegación, no sólo la primera.
 */
async function passConsentScreenIfPresent(page: Page): Promise<void> {
  if (!page.url().includes("consent.google.com")) return;

  for (const text of CONSENT_BUTTON_LABELS) {
    try {
      const btn = page.getByRole("button", { name: new RegExp(text, "i") });
      if ((await btn.count()) === 0) continue;
      await Promise.all([
        page.waitForURL((u) => !u.toString().includes("consent.google.com"), { timeout: 8000 }),
        btn.first().click({ timeout: 3000 }),
      ]);
      return;
    } catch {
      // probamos la siguiente etiqueta / seguimos aunque falle
    }
  }
}

async function withPage<T>(language: string, fn: (page: Page) => Promise<T>): Promise<T> {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      locale: language,
      userAgent: DESKTOP_USER_AGENT,
      viewport: { width: 1280, height: 800 },
    });
    try {
      const page = await context.newPage();
      return await fn(page);
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    // Cerramos el navegador entero, no solo el contexto — ver el porqué en
    // el comentario de launchBrowser().
    await browser.close().catch(() => {});
  }
}

export interface CollectLinksResult {
  links: string[]; // acumulado: los ya conocidos + los nuevos de este paso
  noNewStreak: number;
  feedFound: boolean;
}

/**
 * Recoge enlaces de fichas desde la lista de resultados de Maps, arrancando
 * de cero y haciendo scroll hasta un límite acotado (nº de scrolls o tiempo).
 * Como no hay forma de "reanudar" el scroll de una página cerrada, cada
 * llamada rehace el scroll desde arriba — pero es barato (sólo carga la
 * lista, no las fichas) y está acotado por lote.
 */
export async function collectPlaceLinksStep(opts: {
  keyword: string;
  zone: string;
  language: string;
  maxResults: number;
  alreadyKnown: string[];
  maxScrollIterations?: number;
  timeBudgetMs?: number;
}): Promise<CollectLinksResult> {
  const {
    keyword,
    zone,
    language,
    maxResults,
    alreadyKnown,
    maxScrollIterations = 40,
    timeBudgetMs = 20000,
  } = opts;

  return withPage(language, async (page) => {
    const url = buildMapsSearchUrl(keyword, zone, language);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await passConsentScreenIfPresent(page);

    const feed = page.locator('[role="feed"]');
    try {
      await feed.waitFor({ timeout: 12000 });
    } catch {
      return { links: alreadyKnown, noNewStreak: 99, feedFound: false };
    }

    const seen = new Set(alreadyKnown);
    const links = [...alreadyKnown];
    let noNew = 0;
    const deadline = Date.now() + timeBudgetMs;

    for (let i = 0; i < maxScrollIterations && links.length < maxResults; i++) {
      if (Date.now() > deadline) break;

      const cards = await page.locator("a.hfpxzc").all();
      let added = 0;
      for (const card of cards) {
        if (links.length >= maxResults) break;
        const href = await card.getAttribute("href");
        if (href && !seen.has(href)) {
          seen.add(href);
          links.push(href);
          added++;
        }
      }

      if (added === 0) {
        noNew++;
        if (noNew >= 4) break;
      } else {
        noNew = 0;
      }

      await page.evaluate(
        "document.querySelector('[role=\"feed\"]')?.scrollBy(0, 2500)"
      );
      await page.waitForTimeout(added === 0 ? 800 : 400);
    }

    return { links, noNewStreak: noNew, feedFound: true };
  });
}

/**
 * Los botones `data-item-id` de Maps (dirección, teléfono) suelen incluir un
 * icono cuyo texto accesible cae en su propia línea antes del valor real;
 * nos quedamos con la última línea no vacía.
 */
function lastNonEmptyLine(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

// Timeouts cortos a propósito: en este punto la página ya cargó
// (domcontentloaded + espera corta), así que si un campo concreto no existe
// para este negocio, el locator debe fallar rápido en vez de esperar varios
// segundos por cada campo — con 5-6 campos por ficha esa espera se
// multiplicaba y llegó a agotar el maxDuration de la función (visto en
// producción: una tanda de 5 fichas tardó más de 90s).
const FIELD_TIMEOUT_MS = 900;

async function extractPlaceDetails(page: Page, sourceUrl: string): Promise<PlaceDetails> {
  const info: PlaceDetails = {
    sourceUrl,
    name: "",
    address: "",
    phone: "",
    website: "",
    rating: 0,
    category: "",
  };
  try {
    info.name = (await page.locator("h1").first().innerText({ timeout: FIELD_TIMEOUT_MS })).trim();
  } catch {}
  try {
    const raw = (await page.locator(".fontDisplayLarge").first().innerText({ timeout: FIELD_TIMEOUT_MS }))
      .trim()
      .replace(",", ".");
    info.rating = parseFloat(raw) || 0;
  } catch {}
  try {
    info.category = (await page.locator("button.DkEaL").first().innerText({ timeout: FIELD_TIMEOUT_MS })).trim();
  } catch {}
  try {
    info.address = lastNonEmptyLine(
      await page.locator('button[data-item-id="address"]').first().innerText({ timeout: FIELD_TIMEOUT_MS })
    );
  } catch {}
  try {
    info.phone = lastNonEmptyLine(
      await page.locator('button[data-item-id^="phone"]').first().innerText({ timeout: FIELD_TIMEOUT_MS })
    );
  } catch {}
  try {
    info.website = (
      (await page
        .locator('a[data-item-id="authority"]')
        .first()
        .getAttribute("href", { timeout: FIELD_TIMEOUT_MS })) || ""
    ).trim();
  } catch {}
  return info;
}

export interface DetailBatchResult {
  details: PlaceDetails[];
  /** Cuántos enlaces de `links` se han consumido (con éxito o sin él) —
   *  puede ser menor que `links.length` si se acabó el presupuesto de
   *  tiempo. El llamador debe avanzar su cursor solo por este número. */
  consumed: number;
}

/**
 * Visita una tanda de fichas (enlaces de Maps) y extrae sus datos, dentro de
 * un único contexto/página reutilizada para toda la tanda. Se corta por
 * presupuesto de tiempo, no solo por cantidad — así una ficha lenta nunca
 * hace que el paso entero supere el maxDuration de la función.
 */
export async function detailPlacesBatch(
  links: string[],
  language: string,
  timeBudgetMs = 50000
): Promise<DetailBatchResult> {
  if (links.length === 0) return { details: [], consumed: 0 };
  return withPage(language, async (page) => {
    const results: PlaceDetails[] = [];
    const deadline = Date.now() + timeBudgetMs;
    let consumed = 0;

    for (const link of links) {
      if (Date.now() > deadline) break;
      consumed++;
      try {
        await page.goto(link, { waitUntil: "domcontentloaded", timeout: 8000 });
        await passConsentScreenIfPresent(page);
        await page.waitForTimeout(150);
        results.push(await extractPlaceDetails(page, link));
      } catch {
        // ficha no disponible / timeout — se omite y se sigue con la siguiente
      }
    }
    return { details: results, consumed };
  });
}
