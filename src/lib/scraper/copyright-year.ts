/**
 * Año más reciente del "© 20XX" de una web — si es de hace años, nadie la ha
 * tocado en mucho tiempo. Aparte de web-insights.ts porque también lo usa
 * digital-need.ts, que se importa en el navegador (sin cheerio).
 */
export function detectCopyrightYear(html: string): number | null {
  const thisYear = new Date().getFullYear();
  let best: number | null = null;
  for (const m of html.matchAll(/(?:©|&copy;|&#169;|copyright)\s*(?:\d{4}\s*[-–—]\s*)?((?:19|20)\d{2})/gi)) {
    const y = Number(m[1]);
    if (y >= 1995 && y <= thisYear && (best === null || y > best)) best = y;
  }
  return best;
}
