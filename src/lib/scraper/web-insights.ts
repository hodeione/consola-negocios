/**
 * Datos de venta que se sacan de la web de un negocio, además de emails y
 * teléfonos (ver contact-extract.ts):
 *
 * - Titular legal (persona o empresa) y NIF/CIF, del "Aviso legal" — en
 *   España la LSSI obliga a publicarlo, así que suele estar.
 * - Con qué está hecha (WordPress, Wix...), año del copyright, si tiene
 *   tienda online o reservas/citas online, y qué redes sociales enlaza.
 *
 * Todo heurístico y barato (regex sobre HTML que ya descargamos más 1-2
 * peticiones al aviso legal): ayuda al agente, no es un dato certificado.
 */
import * as cheerio from "cheerio";
import { detectCopyrightYear } from "./copyright-year";

export { detectCopyrightYear };

export interface WebInsights {
  legalOwnerName: string;
  /** "persona" | "empresa" | "" (no se sabe) */
  legalOwnerType: string;
  legalTaxId: string;
  webTech: string;
  webCopyrightYear: number | null;
  hasOnlineShop: boolean;
  hasOnlineBooking: boolean;
  socialLinks: string[];
}

export const EMPTY_INSIGHTS: WebInsights = {
  legalOwnerName: "",
  legalOwnerType: "",
  legalTaxId: "",
  webTech: "",
  webCopyrightYear: null,
  hasOnlineShop: false,
  hasOnlineBooking: false,
  socialLinks: [],
};

// ── Aviso legal ─────────────────────────────────────────────

const LEGAL_LINK_RE = /aviso[\s_-]*legal|legal[\s_-]*notice|nota[\s_-]*legal|informaci[oó]n[\s_-]*legal|^legal$|t[eé]rminos|condiciones[\s_-]*de[\s_-]*uso/i;
export const LEGAL_FALLBACK_PATHS = ["/aviso-legal", "/aviso-legal/", "/legal", "/aviso_legal", "/legal-notice"];

/** Enlaces al aviso legal que aparecen en la portada (normalmente en el pie). */
export function findLegalLinks(homeHtml: string, base: string): string[] {
  if (!homeHtml) return [];
  const $ = cheerio.load(homeHtml);
  const links = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    if (!LEGAL_LINK_RE.test(text) && !LEGAL_LINK_RE.test(href.replace(/^.*\//, "").replace(/[-_]/g, " "))) return;
    try {
      const url = new URL(href, base.endsWith("/") ? base : `${base}/`);
      if (url.protocol.startsWith("http") && url.hostname === new URL(base).hostname) links.add(url.toString());
    } catch {
      // href inválido
    }
  });
  return [...links].slice(0, 2);
}

// NIF (persona): 8 cifras + letra. NIE: X/Y/Z + 7 cifras + letra.
// CIF (sociedad): letra de tipo + 7 cifras + control.
const NIF_RE = /\b(\d{8}[A-HJ-NP-TV-Z])\b/;
const NIE_RE = /\b([XYZ]\d{7}[A-HJ-NP-TV-Z])\b/;
const CIF_RE = /\b([ABCDEFGHJNPQRSUVW][-\s]?\d{7}[0-9A-J])\b/;

const COMPANY_SUFFIX_RE =
  /\b(S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?\s?U?\.?|S\.?\s?L\.?\s?L\.?|S\.?\s?Coop\.?|C\.?\s?B\.?|S\.?\s?C\.?\s?P\.?|SOCIEDAD LIMITADA|SOCIEDAD AN[OÓ]NIMA|COOPERATIVA)(?=[\s,.;:)]|$)/i;

// Etiquetas tras las que suele ir el nombre del titular.
const OWNER_LABEL_RE =
  /(?:titular(?:\s+del?\s+(?:sitio|portal|dominio|web|p[aá]gina)(?:\s+web)?)?|raz[oó]n\s+social|denominaci[oó]n(?:\s+social)?|nombre(?:\s+y\s+apellidos)?|responsable(?:\s+del?\s+(?:sitio|tratamiento|web))?|empresa|propietario)\s*(?:es)?\s*[:：\-–]\s*/gi;

// Frases tipo "… es titularidad de X" / "el titular de esta web es X".
const OWNER_PHRASE_RE =
  /(?:titularidad\s+de|propiedad\s+de|titular\s+de\s+(?:este|esta|la|el)\s+(?:sitio|web|p[aá]gina|portal|dominio)(?:\s+web)?\s+es)\s+(?:la\s+(?:empresa|entidad|mercantil)\s+|d(?:on|o[ñn]a)\.?\s+|D\.?ª?\s+)?/gi;

const STOP_RE = /\s*(?:,|;|\||\(|\bcon\s+(?:NIF|CIF|DNI|domicilio)|\b(?:NIF|CIF|DNI|N\.I\.F|C\.I\.F)\b|\bdomicili|\binscrit|\bdirecci[oó]n|\btel[eé]fono|\bemail|\be-mail|\bcorreo|\bcon\s+sede|\by\s+con\b|\bcon\s+(?:CIF|NIF)|(?<![A-Z])\.\s|$)/i;

const NAME_BEFORE_TAXID_RE =
  /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ&.'\s-]{3,70}?)\s*,?\s*(?:con\s+)?(?:N\.?I\.?F|C\.?I\.?F|DNI)\.?\s*(?:n[º°o]\.?\s*)?[:：]?\s*(?:[A-Z]-?\d{7}[0-9A-J]|\d{8}[A-Z])/g;
const COMPANY_NAME_RE =
  /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ&.'\s-]{2,60}?\s(?:S\.?\s?L\.?\s?U?\.?|S\.?\s?A\.?\s?U?\.?|SOCIEDAD LIMITADA|SOCIEDAD AN[OÓ]NIMA))(?=[\s,.;:)]|$)/g;

const BAD_OWNER_RE =
  /^(?:el|la|los|las|este|esta|[eé]ste|nosotros|usted|presente|sitio|web|p[aá]gina|portal|datos|informaci[oó]n|responsable|titular|domicilio|direcci[oó]n|nif|cif|email|tel[eé]fono|aviso|legal|n\/a|xxx+)\b/i;

function cleanOwner(raw: string): string {
  let cut = raw.split(STOP_RE)[0] ?? "";
  // Etiqueta repetida ("Denominación social: X") y lo que va tras una cifra
  // o un separador suele ser ya la dirección ("Jesús Galíndez 12").
  cut = cut.replace(/^(?:[a-záéíóúñ]+\s+)*(?:denominaci[oó]n(?:\s+social)?|raz[oó]n\s+social|titular|nombre|identidad)\s*[:：-]?\s*/i, "");
  cut = cut.replace(/^(?:[a-záéíóúñ]+\s+)+(?=[A-ZÁÉÍÓÚÑ])/, ""); // "con X S.L." → "X S.L."
  cut = cut.split(/\s[·•|–—]\s|\s\d/)[0] ?? "";
  const name = cut.replace(/^[\s"'“«]+|[\s"'”».:\-–]+$/g, "").replace(/\s+/g, " ").trim();
  if (name.length < 4 || name.length > 80) return "";
  if (BAD_OWNER_RE.test(name)) return "";
  if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]{2}/.test(name)) return "";
  if (/https?:|www\.|@/.test(name)) return "";
  // Más de 8 palabras ya no es un nombre, es una frase.
  if (name.split(" ").length > 8) return "";
  return name;
}

/**
 * "El titular de esta web es Balear Plus S.L." → "Balear Plus S.L.": se queda
 * con la última tira de palabras en mayúscula (admite de/del/la/y/& en medio
 * y el sufijo societario).
 */
function trailingProperName(s: string): string {
  const words = s.trim().split(/\s+/);
  const CONNECTOR = /^(?:de|del|la|las|los|y|e|&|i)$/i;
  const SUFFIX = /^(?:S\.?L\.?U?\.?|S\.?A\.?U?\.?|SL|SA|SLU|SOCIEDAD|LIMITADA|AN[OÓ]NIMA)[.,]?$/i;
  let start = words.length;
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (/^[A-ZÁÉÍÓÚÑ0-9&]/.test(w) || SUFFIX.test(w) || (CONNECTOR.test(w) && i < words.length - 1 && i > 0)) start = i;
    else break;
  }
  while (start < words.length && CONNECTOR.test(words[start])) start++;
  return words.slice(start).join(" ");
}

function titleCaseIfShouting(name: string): string {
  if (name !== name.toUpperCase()) return name;
  return name
    .toLowerCase()
    .replace(/(^|\s|-)([a-záéíóúñ])/g, (_, sep, c) => sep + c.toUpperCase())
    .replace(/\b(S\.?l\.?u?|S\.?a\.?u?|C\.?b)\b\.?/gi, (m) => m.toUpperCase());
}

export function extractLegalOwner(html: string): Pick<WebInsights, "legalOwnerName" | "legalOwnerType" | "legalTaxId"> {
  if (!html) return { legalOwnerName: "", legalOwnerType: "", legalTaxId: "" };
  const $ = cheerio.load(html);
  $("script, style, noscript, nav, header").remove();
  const text = ($("main").text() || $("body").text() || $.root().text()).replace(/ /g, " ").replace(/[ \t]+/g, " ");

  const candidates: string[] = [];
  for (const re of [OWNER_LABEL_RE, OWNER_PHRASE_RE]) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 140).split("\n")[0];
      const name = cleanOwner(after);
      if (name) candidates.push(name);
    }
  }

  // Sin etiqueta clara: el nombre que va justo antes del CIF/NIF ("X S.L.,
  // con CIF B12345678") o cualquier razón social con S.L./S.A. del texto.
  for (const re of [NAME_BEFORE_TAXID_RE, COMPANY_NAME_RE]) {
    for (const m of text.matchAll(re)) {
      const name = cleanOwner(trailingProperName(m[1]));
      if (name) candidates.push(name);
    }
  }

  // Preferimos el candidato que parece empresa (S.L....) o el primero.
  const owner = candidates.find((c) => COMPANY_SUFFIX_RE.test(c)) ?? candidates[0] ?? "";

  const cif = text.match(CIF_RE)?.[1]?.replace(/[-\s]/g, "") ?? "";
  const nif = text.match(NIF_RE)?.[1] ?? text.match(NIE_RE)?.[1] ?? "";
  const taxId = cif || nif;

  let type = "";
  if (owner && COMPANY_SUFFIX_RE.test(owner)) type = "empresa";
  else if (cif) type = "empresa";
  else if (nif && owner) type = "persona";
  else if (owner && /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+(?:de\s+(?:la\s+)?)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){2,3}$/.test(owner)) type = "persona";

  return { legalOwnerName: owner ? titleCaseIfShouting(owner) : "", legalOwnerType: owner ? type : "", legalTaxId: taxId };
}

// ── Portada: tecnología, año, tienda, reservas, redes ──────

const TECH_PATTERNS: [string, RegExp][] = [
  ["Shopify", /cdn\.shopify\.com|Shopify\.theme/i],
  ["PrestaShop", /prestashop/i],
  ["Wix", /static\.wixstatic\.com|wix\.com|_wixCIDX|X-Wix/i],
  ["Squarespace", /squarespace/i],
  ["Jimdo", /jimdo/i],
  ["Webnode", /webnode/i],
  ["GoDaddy", /img1\.wsimg\.com|godaddy/i],
  ["Google Sites", /sites\.google\.com/i],
  ["Joomla", /\/media\/jui\/|Joomla!/i],
  ["Drupal", /Drupal\.settings|\/sites\/default\/files/i],
  ["Elementor", /elementor/i],
  ["WordPress", /wp-content|wp-includes|WordPress/i],
];

// Señales de que de verdad vende online (tener WooCommerce instalado no basta:
// muchas webs lo traen en la plantilla sin usarlo).
const SHOP_RE = /cdn\.shopify\.com|prestashop|add[-_]to[-_]cart|a[ñn]adir al carrito|href=["'][^"']*\/(?:carrito|cart|tienda|shop|producto|product)\/?["']|cesta de la compra/i;
const BOOKING_RE =
  /thefork|eltenedor|covermanager|booksy|doctoralia|treatwell|calendly|simplybook|bookitit|reservas?\s+online|reservar\s+(?:mesa|cita|ahora|online)|pedir\s+cita|pide\s+cita|cita\s+online|book\s+now|\/reservas?\b|\/booking\b|\/citas?\b|resengo|restoo|mapex|glofox|deporsite|aimharder|trainingym/i;

const SOCIAL_PATTERNS: [string, RegExp][] = [
  ["facebook", /facebook\.com\/(?!sharer|share|dialog|plugins|tr\b)[^"'\s>]+/i],
  ["instagram", /instagram\.com\/(?!p\/|explore)[^"'\s>]+/i],
  ["tiktok", /tiktok\.com\/@[^"'\s>]+/i],
  ["linkedin", /linkedin\.com\/(?:company|in)\/[^"'\s>]+/i],
  ["youtube", /youtube\.com\/(?:c\/|channel\/|user\/|@)[^"'\s>]+/i],
  ["x", /(?:twitter|x)\.com\/(?!share|intent|home)[A-Za-z0-9_]{2,}/i],
  ["whatsapp", /wa\.me\/|api\.whatsapp\.com\/send/i],
];

export function detectWebTech(html: string): string {
  for (const [name, re] of TECH_PATTERNS) {
    if (re.test(html)) {
      // Elementor siempre va sobre WordPress — se nombra como tal.
      return name === "Elementor" ? "WordPress" : name;
    }
  }
  return html ? "A medida / desconocida" : "";
}


export function analyzeHomePage(html: string): Omit<WebInsights, "legalOwnerName" | "legalOwnerType" | "legalTaxId"> {
  if (!html) return { webTech: "", webCopyrightYear: null, hasOnlineShop: false, hasOnlineBooking: false, socialLinks: [] };
  const hasOnlineShop = SHOP_RE.test(html);
  const tech = detectWebTech(html);
  return {
    webTech: tech === "WordPress" && hasOnlineShop && /woocommerce/i.test(html) ? "WordPress + WooCommerce" : tech,
    webCopyrightYear: detectCopyrightYear(html),
    hasOnlineShop,
    hasOnlineBooking: BOOKING_RE.test(html),
    socialLinks: SOCIAL_PATTERNS.filter(([, re]) => re.test(html)).map(([name]) => name),
  };
}
