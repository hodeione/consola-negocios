// Limpia "Tel. web" de los negocios ya guardados: quita lo que no es un
// teléfono español válido (IDs, códigos postales...), duplicados con/sin +34
// y deja como mucho 5 — la misma regla que aplica ya el scraper.
// Uso: npx tsx scripts/clean-web-phones.ts          (solo simula)
//      npx tsx scripts/clean-web-phones.ts --apply  (guarda los cambios)
import "dotenv/config";
import { Client } from "pg";
import { isValidSpanishPhone } from "../src/lib/businesses/phone";

const MAX_PHONES = 5;

function cleanPhones(phones: string[]): string[] {
  const unique = new Map<string, string>();
  for (const p of phones) {
    if (!p || !isValidSpanishPhone(p)) continue;
    const key = p.replace(/\D/g, "").replace(/^0034|^34/, "");
    if (!unique.has(key)) unique.set(key, p);
  }
  return [...unique.values()].slice(0, MAX_PHONES);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string; webPhones: string[] }>(
      `select id, "webPhones" from businesses where cardinality("webPhones") > 0`,
    );

    const changes = rows
      .map((r) => ({ id: r.id, before: r.webPhones, after: cleanPhones(r.webPhones) }))
      .filter((c) => c.after.length !== c.before.length || c.after.some((p, i) => p !== c.before[i]));

    const removed = changes.reduce((n, c) => n + c.before.length - c.after.length, 0);
    const emptied = changes.filter((c) => c.after.length === 0).length;
    console.log(`Negocios con Tel. web: ${rows.length}`);
    console.log(`A limpiar: ${changes.length} negocios · ${removed} números fuera · ${emptied} se quedan sin Tel. web`);
    for (const c of changes.slice(0, 3)) {
      console.log(`  ej.: ${c.before.length} → ${c.after.length} [${c.after.join(", ")}]`);
    }

    if (!apply) {
      console.log("\nSimulación: no se ha cambiado nada. Añade --apply para guardar.");
      return;
    }

    await client.query("begin");
    for (const c of changes) {
      await client.query(`update businesses set "webPhones" = $1 where id = $2`, [c.after, c.id]);
    }
    await client.query("commit");
    console.log(`✔ Guardado: ${changes.length} negocios limpiados.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
