/**
 * Extracción profunda de emails y teléfonos desde la web de un negocio.
 * Port 1:1 de la lógica de `scraperweb/scraper.py` (regexes, desofuscación,
 * JSON-LD, meta tags, atributos data-*), usando `cheerio` en vez de
 * BeautifulSoup y `fetch` en vez de `aiohttp`.
 */
import * as cheerio from "cheerio";
import { isValidSpanishPhone } from "@/lib/businesses/phone";
import {
  analyzeHomePage,
  EMPTY_INSIGHTS,
  extractLegalOwner,
  findLegalLinks,
  LEGAL_FALLBACK_PATHS,
  type WebInsights,
} from "./web-insights";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/;
const EMAIL_RE_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;

// Teléfono: prefijo de país opcional (+XX / 00XX), prefijo de área opcional,
// 7-9 dígitos con separadores habituales.
const PHONE_RE_G =
  /(?:(?:\+|00)\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)?\d{3,5}[\s.-]?\d{3,4}/g;

const OBFUSCATED_RE_G =
  /([A-Za-z0-9._%+-]+)\s*[[({\s](?:at|AT|arroba|@)\s*[\])}\s]\s*([A-Za-z0-9.-]+)\s*[[({\s](?:dot|DOT|punto|\.)\s*[\])}\s]\s*([A-Za-z]{2,7})/gi;

const SPAM_DOMAINS = new Set([
  "example.com",
  "domain.com",
  "email.com",
  "test.com",
  "yourdomain.com",
  "sentry.io",
  "wixpress.com",
  "wordpress.com",
  "schema.org",
  "jquery.com",
]);

const WEB_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
};

function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function clean(email: string): string {
  return unescapeHtml(email).trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  if (!EMAIL_RE.test(email)) return false;
  const domain = email.split("@").pop() ?? "";
  if (SPAM_DOMAINS.has(domain)) return false;
  if (/\.(png|jpg|gif|svg|webp|ico)$/i.test(email)) return false;
  if (email.length > 80) return false;
  return true;
}

function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const prefix = trimmed.startsWith("+") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return digits ? prefix + digits : "";
}

// Solo teléfonos españoles plausibles (9 cifras empezando por 6-9, con o sin
// +34). Antes valía cualquier tira de 7-15 cifras y se colaban IDs, códigos
// postales y números de seguimiento de páginas como Facebook.
function isValidPhone(phone: string): boolean {
  return !!phone && isValidSpanishPhone(phone);
}

const MAX_PHONES = 5;

function parseEmailsDeep(html: string): Set<string> {
  const found = new Set<string>();
  const $ = cheerio.load(html);

  // 1. Enlaces mailto: (más fiable)
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.toLowerCase().includes("mailto:")) {
      const addr = clean(href.toLowerCase().split("mailto:").pop()!.split("?")[0]);
      if (isValidEmail(addr)) found.add(addr);
    }
  });

  // 2. Regex sobre el texto visible
  const text = $("body").text() || $.root().text();
  for (const m of text.matchAll(EMAIL_RE_G)) {
    const e = clean(m[0]);
    if (isValidEmail(e)) found.add(e);
  }

  // 3. Regex sobre el HTML crudo (data-email, variables JS, etc.)
  for (const m of html.matchAll(EMAIL_RE_G)) {
    const e = clean(m[0]);
    if (isValidEmail(e)) found.add(e);
  }

  // 4. Ofuscado: "info [at] dominio [dot] com"
  for (const m of text.matchAll(OBFUSCATED_RE_G)) {
    const e = clean(`${m[1]}@${m[2]}.${m[3]}`);
    if (isValidEmail(e)) found.add(e);
  }

  // 5. JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text() || "{}");
      const blob = JSON.stringify(data);
      for (const m of blob.matchAll(EMAIL_RE_G)) {
        const e = clean(m[0]);
        if (isValidEmail(e)) found.add(e);
      }
    } catch {
      // JSON inválido — se ignora
    }
  });

  // 6. Meta tags
  $("meta").each((_, el) => {
    const content = $(el).attr("content") || "";
    for (const m of content.matchAll(EMAIL_RE_G)) {
      const e = clean(m[0]);
      if (isValidEmail(e)) found.add(e);
    }
  });

  // 7. Atributos data-*
  $("*").each((_, el) => {
    const attribs = (el as unknown as { attribs?: Record<string, string> }).attribs;
    if (!attribs) return;
    for (const val of Object.values(attribs)) {
      if (typeof val === "string" && val.includes("@")) {
        for (const m of val.matchAll(EMAIL_RE_G)) {
          const e = clean(m[0]);
          if (isValidEmail(e)) found.add(e);
        }
      }
    }
  });

  return found;
}

function parsePhonesDeep(html: string): Set<string> {
  const found = new Set<string>();
  const $ = cheerio.load(html);

  // 1. Enlaces tel: (más fiable)
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.toLowerCase().startsWith("tel:")) {
      const raw = href.slice(4).split("?")[0];
      const norm = normalizePhone(raw);
      if (isValidPhone(norm)) found.add(norm);
    }
  });

  // 2. JSON-LD, campo "telephone"
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text() || "{}");
      const blob = JSON.stringify(data);
      for (const m of blob.matchAll(/"telephone"\s*:\s*"([^"]+)"/g)) {
        const norm = normalizePhone(m[1]);
        if (isValidPhone(norm)) found.add(norm);
      }
    } catch {
      // JSON inválido — se ignora
    }
  });

  // 3. Microdata itemprop="telephone"
  $('[itemprop="telephone"]').each((_, el) => {
    const raw = $(el).attr("content") || $(el).text();
    const norm = normalizePhone(raw);
    if (isValidPhone(norm)) found.add(norm);
  });

  // 4. Regex sobre texto visible (fallback, menos preciso) — solo si lo
  // estructurado no dio nada, para no mezclar números sueltos con los buenos.
  if (found.size === 0) {
    const text = $("body").text() || $.root().text();
    for (const m of text.matchAll(PHONE_RE_G)) {
      const norm = normalizePhone(m[0]);
      if (isValidPhone(norm)) found.add(norm);
    }
  }

  // Mismo número con y sin prefijo cuenta una sola vez.
  const unique = new Map<string, string>();
  for (const p of found) {
    const key = p.replace(/\D/g, "").replace(/^0034|^34/, "");
    if (!unique.has(key)) unique.set(key, p);
  }
  return new Set([...unique.values()].slice(0, MAX_PHONES));
}

async function fetchHtml(url: string, timeoutMs = 5000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: WEB_HEADERS,
      redirect: "follow",
      signal: controller.signal,
    });
    if (!res.ok) return "";
    const ct = res.headers.get("content-type") || "";
    if (ct && !ct.includes("text") && !ct.includes("html")) return "";
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Descarga solo la portada (sin las páginas de contacto candidatas) — para
 * cuando lo único que hace falta es mirar el HTML (p.ej. calcular la
 * necesidad digital de un negocio ya guardado, sin volver a sacar
 * emails/teléfonos). Un único fetch, no cinco.
 */
export async function fetchHomePage(website: string): Promise<{ html: string; ok: boolean }> {
  const html = await fetchHtml(website.replace(/\/+$/, ""));
  return { html, ok: !!html };
}

/**
 * Descarga la home + páginas de contacto candidatas en paralelo (timeout 5s
 * cada una) y extrae emails/teléfonos combinados de todas.
 *
 * También devuelve `homeHtml`/`homeFetchOk` (el resultado de descargar solo
 * la portada, sin las páginas de contacto) — no cuesta una petición extra,
 * ya la hacíamos, y sirve para calcular si la web está caída/es antigua
 * (ver src/lib/scraper/digital-need.ts) sin duplicar el fetch.
 */
/**
 * Titular legal + datos de la web (ver web-insights.ts). Solo lo llama el
 * script local scripts/backfill-web-insights.ts — en Vercel no se ejecuta,
 * para no gastar tiempo de función en las peticiones extra. Usa la portada ya
 * descargada y solo pide aparte el aviso legal: primero los enlaces que haya
 * en la portada y, si no hay, las rutas típicas (/aviso-legal, /legal...).
 */
export async function fetchWebInsights(website: string, homeHtml: string): Promise<WebInsights> {
  if (!homeHtml) return EMPTY_INSIGHTS;
  const base = website.replace(/\/+$/, "");
  const home = analyzeHomePage(homeHtml);

  // A veces el titular ya está en el pie de la portada.
  let owner = extractLegalOwner(homeHtml);
  if (!owner.legalOwnerName) {
    const linked = findLegalLinks(homeHtml, base);
    const urls = linked.length > 0 ? linked : LEGAL_FALLBACK_PATHS.slice(0, 3).map((p) => base + p);
    const pages = await Promise.all(urls.map((u) => fetchHtml(u)));
    for (const html of pages) {
      const found = extractLegalOwner(html);
      if (found.legalOwnerName) {
        owner = found;
        break;
      }
      if (!owner.legalTaxId && found.legalTaxId) owner = { ...owner, legalTaxId: found.legalTaxId };
    }
  }

  return { ...home, ...owner };
}

export async function fetchContactInfo(
  website: string
): Promise<{ emails: string[]; webPhones: string[]; homeHtml: string; homeFetchOk: boolean }> {
  const base = website.replace(/\/+$/, "");
  const candidates = [
    base,
    `${base}/contacto`,
    `${base}/contact`,
    `${base}/contact-us`,
    `${base}/about`,
    `${base}/sobre-nosotros`,
  ];

  const pages = await Promise.all(candidates.map((u) => fetchHtml(u)));
  const [homeHtml] = pages;

  const emails = new Set<string>();
  const webPhones = new Set<string>();
  for (const html of pages) {
    if (!html) continue;
    for (const e of parseEmailsDeep(html)) emails.add(e);
    for (const p of parsePhonesDeep(html)) webPhones.add(p);
  }

  return { emails: [...emails], webPhones: [...webPhones], homeHtml, homeFetchOk: !!homeHtml };
}
