/**
 * Scraper de negocios para correr EN LOCAL (sin Vercel, sin límites de
 * función serverless) — genera un .xlsx en esta misma carpeta con el mismo
 * formato de columnas que "Exportar Excel" de la app, listo para subir con
 * el botón "Importar Excel" de /scrape.
 *
 * Edita `scripts/local-scrape.config.json` con tus zonas/tipos y luego:
 *   npm run scrape:local
 */
import ExcelJS from "exceljs";
import { collectPlaceLinksStep, detailPlacesBatch, type PlaceDetails } from "../src/lib/scraper/maps";
import { fetchContactInfo } from "../src/lib/scraper/contact-extract";
import { buildDedupeKey } from "../src/lib/scraper/dedupe";
import config from "./local-scrape.config.json";

interface Row {
  name: string;
  zone: string;
  keyword: string;
  address: string;
  mapsPhone: string;
  website: string;
  emails: string[];
  webPhones: string[];
  rating: number;
  category: string;
  dedupeKey: string;
}

const HEADERS = [
  "Nombre", "Zona", "Keyword", "Dirección", "Tel. Maps", "Web", "Emails",
  "Tel. Web", "Rating", "Categoría", "Estado", "Prioridad", "Contacto",
  "Cargo", "Etiquetas", "Próxima llamada", "Último contacto", "Asignado a",
];
const COL_WIDTHS = [28, 18, 16, 40, 16, 34, 40, 24, 8, 20, 16, 10, 20, 18, 22, 16, 16, 18];

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function collectAllLinks(keyword: string, zone: string, language: string, maxResults: number): Promise<string[]> {
  let links: string[] = [];
  for (let i = 0; i < 20; i++) {
    const result = await collectPlaceLinksStep({
      keyword,
      zone,
      language,
      maxResults,
      alreadyKnown: links,
      timeBudgetMs: 20000,
    });
    links = result.links;
    console.log(`    …recogiendo enlaces: ${links.length}/${maxResults}`);
    if (links.length >= maxResults || result.noNewStreak >= 4 || !result.feedFound) break;
  }
  return links;
}

async function detailAllPlaces(links: string[], language: string): Promise<PlaceDetails[]> {
  const details: PlaceDetails[] = [];
  let idx = 0;
  while (idx < links.length) {
    const batch = links.slice(idx, idx + 10);
    const { details: newDetails, consumed } = await detailPlacesBatch(batch, language, 50000);
    details.push(...newDetails);
    idx += Math.max(consumed, 1); // por si acaso, para no quedarse en bucle infinito
    console.log(`    …leyendo fichas: ${Math.min(idx, links.length)}/${links.length}`);
  }
  return details;
}

async function enrichAndFilter(details: PlaceDetails[], zone: string, keyword: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (const d of details) {
    const { emails, webPhones } = d.website ? await fetchContactInfo(d.website) : { emails: [], webPhones: [] };
    const hasContact = !!d.phone || emails.length > 0 || webPhones.length > 0;
    if (!d.name || !hasContact) continue;
    rows.push({
      name: d.name,
      zone,
      keyword,
      address: d.address,
      mapsPhone: d.phone,
      website: d.website,
      emails,
      webPhones,
      rating: d.rating,
      category: d.category,
      dedupeKey: buildDedupeKey({ website: d.website, phone: d.phone, name: d.name }),
    });
  }
  return rows;
}

async function writeXlsx(rows: Row[], filename: string) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Negocios");
  const headerRow = ws.addRow(HEADERS);
  headerRow.eachCell((cell, colIndex) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    ws.getColumn(colIndex).width = COL_WIDTHS[colIndex - 1];
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  rows.forEach((r, i) => {
    const row = ws.addRow([
      r.name, r.zone, r.keyword, r.address, r.mapsPhone, r.website,
      r.emails.join("; "), r.webPhones.join("; "), r.rating || "", r.category,
      "", "", "", "", "", "", "", "", // Estado/Prioridad/Contacto/... — se rellenan al importar
    ]);
    const fill: ExcelJS.Fill = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: i % 2 === 0 ? "FFEFF6FF" : "FFFFFFFF" },
    };
    row.eachCell((cell) => {
      cell.font = { size: 10 };
      cell.fill = fill;
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: HEADERS.length } };
  await wb.xlsx.writeFile(filename);
}

async function main() {
  const { zones, keywords, maxResultsPerCombo, language } = config as {
    zones: string[];
    keywords: string[];
    maxResultsPerCombo: number;
    language: string;
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
      const links = await collectAllLinks(keyword, zone, language, maxResultsPerCombo);
      const details = await detailAllPlaces(links, language);
      const rows = await enrichAndFilter(details, zone, keyword);
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
  console.log(`Súbelo desde /scrape con el botón "Importar Excel".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
