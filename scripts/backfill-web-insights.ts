// Analiza la web de los negocios ya guardados que aún no se han analizado:
// titular del aviso legal, tecnología, año del ©, tienda/reservas, redes, y
// recalcula la necesidad digital (que ahora incluye "web antigua").
// Se ejecuta en local (no en Vercel, para no gastar tiempo de función):
//   npm run webs:analyze                         (base de datos del .env)
//   $env:DATABASE_URL="postgresql://...neon..."; npm run webs:analyze   (producción)
// Opcional: -- --limit N
// Se puede cortar y relanzar: solo procesa los que tienen webInsightsAt vacío.
import "dotenv/config";
import { Client } from "pg";
import { fetchHomePage, fetchWebInsights } from "../src/lib/scraper/contact-extract";
import { computeDigitalNeed } from "../src/lib/scraper/digital-need";

const CONCURRENCY = 15;

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 100_000;

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; website: string }>(
      `select id, website from businesses where "webInsightsAt" is null and website <> '' order by "digitalNeedScore" desc limit $1`,
      [limit],
    );
    console.log(`Negocios por analizar: ${rows.length}`);

    let done = 0;
    let owners = 0;
    let down = 0;
    const queue = [...rows];
    async function worker() {
      for (let b = queue.shift(); b; b = queue.shift()) {
        const { html, ok } = await fetchHomePage(b.website);
        const { signals, score } = computeDigitalNeed({ website: b.website, homeHtml: html, homeFetchOk: ok });
        const i = await fetchWebInsights(b.website, html);
        if (!ok) down++;
        if (i.legalOwnerName) owners++;
        await client.query(
          `update businesses set "legalOwnerName"=$2, "legalOwnerType"=$3, "legalTaxId"=$4, "webTech"=$5, "webCopyrightYear"=$6,
             "hasOnlineShop"=$7, "hasOnlineBooking"=$8, "socialLinks"=$9, "digitalNeedSignals"=$10, "digitalNeedScore"=$11, "webInsightsAt"=now()
           where id=$1`,
          [b.id, i.legalOwnerName, i.legalOwnerType, i.legalTaxId, i.webTech, i.webCopyrightYear, i.hasOnlineShop, i.hasOnlineBooking, i.socialLinks, signals, score],
        );
        if (++done % 100 === 0) console.log(`  ${done}/${rows.length} · con titular ${owners} · sin cargar ${down}`);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`✔ ${done} analizados · titular encontrado en ${owners} · ${down} webs no cargaron`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
