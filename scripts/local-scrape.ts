/**
 * Scraper de negocios para correr EN LOCAL (sin Vercel, sin límites de
 * función serverless) — genera un .xlsx en esta misma carpeta con el mismo
 * formato de columnas que "Exportar Excel" de la app, listo para subir con
 * el botón "Importar Excel" de /businesses.
 *
 * Para un lote concreto y acotado que tú decides a mano: edita
 * `scripts/local-scrape.config.json` con tus zonas/tipos y luego:
 *   npm run scrape:local
 *
 * Para cobertura automática de toda España sin escribir zonas a mano, usa
 * en su lugar `scripts/local-scrape-coverage.ts` (`npm run scrape:coverage`).
 */
import { sleep, scrapeCombo, writeXlsx, type Row } from "./lib/scrape-helpers";
import config from "./local-scrape.config.json";

async function main() {
  const { zones, keywords, maxResultsPerCombo, language, minDigitalNeedScore } = config as {
    zones: string[];
    keywords: string[];
    maxResultsPerCombo: number;
    language: string;
    minDigitalNeedScore?: number;
  };

  if (zones.length === 0) {
    console.error("Añade al menos una zona en scripts/local-scrape.config.json");
    process.exit(1);
  }
  const keywordList = keywords.length > 0 ? keywords : [""];
  const combos = zones.flatMap((zone) => keywordList.map((keyword) => ({ zone, keyword })));
  console.log(`${combos.length} combinación(es) zona × tipo a procesar.\n`);

  const byDedupeKey = new Map<string, Row>();
  const filename = `negocios-local-${new Date().toISOString().slice(0, 10)}.xlsx`;

  for (let i = 0; i < combos.length; i++) {
    const { zone, keyword } = combos[i];
    console.log(`[${i + 1}/${combos.length}] ${keyword || "(todos)"} — ${zone}`);
    try {
      const rows = await scrapeCombo(zone, keyword, language, maxResultsPerCombo, minDigitalNeedScore ?? 0);
      for (const row of rows) byDedupeKey.set(row.dedupeKey, row); // dedupe igual que la app
      console.log(`  → ${rows.length} negocios con contacto (${byDedupeKey.size} acumulados en total)\n`);
    } catch (err) {
      console.error(`  ⚠ Fallo en esta combinación, se continúa con la siguiente:`, err instanceof Error ? err.message : err);
    }
    // Guarda tras cada combinación — si se interrumpe, no se pierde lo ya hecho.
    await writeXlsx([...byDedupeKey.values()], filename);
    await sleep(300);
  }

  console.log(`\nListo: ${byDedupeKey.size} negocios guardados en ${filename}`);
  console.log(`Súbelo desde Negocios con el botón "Importar Excel".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
