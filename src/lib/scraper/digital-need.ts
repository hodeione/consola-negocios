/**
 * "¿Necesita este negocio un servicio digital?" — puntuación 0-100 a partir
 * de señales baratas de obtener (ya las tenemos o cuestan una petición que
 * de todas formas hacíamos para sacar el email/teléfono de la web).
 *
 * No pretende ser infalible — es una ayuda para priorizar a quién llamar
 * primero, no un sustituto del criterio del agente. Cuantas más señales,
 * más números que ese negocio de verdad necesite algo del catálogo.
 */

const SOCIAL_ONLY_HOSTS = [
  "facebook.com",
  "instagram.com",
  "wa.me",
  "whatsapp.com",
  "linktr.ee",
  "linktree.com",
  "m.me",
  "t.me",
];

export const DIGITAL_NEED_LABEL: Record<string, string> = {
  sin_web: "Sin web",
  web_red_social: "Web = red social",
  web_caida: "Web caída",
  sin_ssl: "Sin SSL",
  no_responsive: "No responsive",
};

// Orden de severidad, de más a menos determinante — para mostrar primero la
// señal que más pesa cuando solo cabe una en la interfaz.
export const DIGITAL_NEED_SIGNALS = ["sin_web", "web_red_social", "web_caida", "sin_ssl", "no_responsive"] as const;

const SIGNAL_WEIGHT: Record<string, number> = {
  sin_web: 40,
  web_red_social: 35,
  web_caida: 30,
  sin_ssl: 15,
  no_responsive: 15,
};

function hostnameOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export interface DigitalNeedInput {
  website: string;
  /** true si se consiguió descargar la portada de la web (fetch con éxito, contenido no vacío). */
  homeFetchOk: boolean;
  /** HTML de la portada, si se descargó — para mirar el <meta viewport>. */
  homeHtml: string;
}

export interface DigitalNeedResult {
  signals: string[];
  score: number;
}

export function computeDigitalNeed(input: DigitalNeedInput): DigitalNeedResult {
  const website = input.website.trim();
  const signals: string[] = [];

  if (!website) {
    signals.push("sin_web");
  } else {
    const host = hostnameOf(website);
    const isSocialOnly = SOCIAL_ONLY_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    if (isSocialOnly) {
      signals.push("web_red_social");
    } else if (!input.homeFetchOk) {
      signals.push("web_caida");
    } else {
      if (website.toLowerCase().startsWith("http://")) signals.push("sin_ssl");
      if (input.homeHtml && !/<meta[^>]+name=["']viewport["']/i.test(input.homeHtml)) signals.push("no_responsive");
    }
  }

  const score = Math.min(100, signals.reduce((sum, s) => sum + (SIGNAL_WEIGHT[s] ?? 0), 0));
  return { signals, score };
}
