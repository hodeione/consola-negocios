/**
 * Cobertura automática de negocios en toda España — sin escribir zonas ni
 * tipos de negocio a mano. Recorre `scripts/data/spain-zones.json` (116
 * ciudades: todas las capitales de provincia + las principales por
 * población) × `scripts/data/business-categories.json` (65 categorías en 11
 * sectores), en el orden "una categoría en todo el país antes de pasar a la
 * siguiente" — así cada tanda de resultados es útil de inmediato en vez de
 * agotar una sola ciudad antes de tocar las demás.
 *
 * Guarda qué combinaciones ya se han hecho en
 * `scripts/local-scrape-coverage-progress.json` (no se sube a git — son
 * datos de esta máquina), así que se puede parar con Ctrl+C y volver a
 * lanzar más tarde y sigue exactamente donde lo dejó, sin repetir trabajo.
 *
 * Uso:
 *   npm run scrape:coverage
 *
 * Ajusta `scripts/local-scrape-coverage.config.json`:
 *   - batchSize: cuántas combinaciones hacer en esta ejecución (0 = todas
 *     las que falten, sin parar — como el script manual).
 *   - maxResultsPerCombo / language: igual que en el script manual.
 */
import fs from "fs";
import path from "path";
import { sleep, scrapeCombo, writeXlsx, type Row } from "./lib/scrape-helpers";
import zones from "./data/spain-zones.json";
import categoriesBySegment from "./data/business-categories.json";
import coverageConfig from "./local-scrape-coverage.config.json";

const PROGRESS_FILE = path.join(__dirname, "local-scrape-coverage-progress.json");

interface Progress {
  // clave: "zona|||keyword" → nº de negocios con contacto encontrados esa vez
  done: Record<string, number>;
}

function loadProgress(): Progress {
  if (!fs.existsSync(PROGRESS_FILE)) return { done: {} };
  try {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, "utf8"));
  } catch {
    console.warn("⚠ No se pudo leer el progreso anterior, se empieza de cero.");
    return { done: {} };
  }
}

function saveProgress(progress: Progress) {
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function comboKey(zone: string, keyword: string): string {
  return `${zone}|||${keyword}`;
}

async function main() {
  const { batchSize, maxResultsPerCombo, language } = coverageConfig as {
    batchSize: number;
    maxResultsPerCombo: number;
    language: string;
  };

  // Todas las categorías, en el mismo orden que en el fichero (agrupadas por
  // sector solo para que sea legible de editar a mano).
  const categories = Object.values(categoriesBySegment as Record<string, string[]>).flat();

  // Orden "categoría-mayor, zona-menor": primero TODA España para la
  // categoría 1, luego TODA España para la categoría 2... en vez de agotar
  // una ciudad entera antes de pasar a la siguiente.
  const allCombos = categories.flatMap((keyword) => zones.map((zone) => ({ zone, keyword })));

  const progress = loadProgress();
  const pending = allCombos.filter((c) => !(comboKey(c.zone, c.keyword) in progress.done));

  const totalDone = allCombos.length - pending.length;
  console.log(
    `Cobertura: ${zones.length} zonas × ${categories.length} categorías = ${allCombos.length} combinaciones totales.`
  );
  console.log(`Ya hechas en tandas anteriores: ${totalDone}. Quedan: ${pending.length}.\n`);

  if (pending.length === 0) {
    console.log("¡Cobertura completa! No queda ninguna combinación por hacer.");
    console.log("Borra scripts/local-scrape-coverage-progress.json si quieres volver a pasar por todo.");
    return;
  }

  const batch = batchSize > 0 ? pending.slice(0, batchSize) : pending;
  console.log(`Esta ejecución procesa ${batch.length} combinación(es).\n`);

  const byDedupeKey = new Map<string, Row>();
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const filename = `negocios-cobertura-${ts}.xlsx`;

  for (let i = 0; i < batch.length; i++) {
    const { zone, keyword } = batch[i];
    console.log(`[${i + 1}/${batch.length}] ${keyword} — ${zone}`);
    try {
      const rows = await scrapeCombo(zone, keyword, language, maxResultsPerCombo);
      for (const row of rows) byDedupeKey.set(row.dedupeKey, row);
      progress.done[comboKey(zone, keyword)] = rows.length;
      console.log(`  → ${rows.length} negocios con contacto (${byDedupeKey.size} en esta tanda)\n`);
    } catch (err) {
      console.error(`  ⚠ Fallo en esta combinación, se continúa con la siguiente:`, err instanceof Error ? err.message : err);
      // No se marca como hecha — se reintentará en la próxima ejecución.
    }
    // Guarda progreso y fichero tras cada combinación — Ctrl+C en cualquier
    // momento no pierde nada de lo ya conseguido.
    saveProgress(progress);
    if (byDedupeKey.size > 0) await writeXlsx([...byDedupeKey.values()], filename);
    await sleep(300);
  }

  const doneNow = allCombos.length - allCombos.filter((c) => !(comboKey(c.zone, c.keyword) in progress.done)).length;
  console.log(`\nTanda terminada: ${byDedupeKey.size} negocios nuevos guardados en ${filename}.`);
  console.log(`Progreso total de cobertura de España: ${doneNow}/${allCombos.length} combinaciones.`);
  if (byDedupeKey.size > 0) console.log(`Súbelo desde Negocios con el botón "Importar Excel".`);
  console.log(`Vuelve a lanzar "npm run scrape:coverage" para continuar con la siguiente tanda.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
