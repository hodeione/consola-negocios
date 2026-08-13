import { chromium } from "playwright";

const zone = process.argv[2] || "Burgos España";
const keyword = process.argv[3] || "cerrajero";

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("https://consola-negocios.vercel.app/login");
await page.fill('input[name="email"]', "hodeione41@gmail.com");
await page.fill('input[name="password"]', "agente1234");
await Promise.all([
  page.waitForURL("**/", { timeout: 15000 }),
  page.click('button[type="submit"]'),
]);

// Crea el lote directamente por API (sin ambigüedad de qué tarjeta es cuál) y
// hace avanzar la tarea llamando a /step en bucle, igual que hace la propia UI.
const { taskId } = await page.evaluate(
  async ({ zone, keyword }) => {
    const res = await fetch("/api/batch-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zones: [zone], keywords: [keyword], maxResultsPerCombo: 3, language: "es" }),
    });
    const batch = await res.json();
    return { taskId: batch.tasks[0].id };
  },
  { zone, keyword }
);
console.log(`[${zone} / ${keyword}] tarea creada: ${taskId}`);

let last = null;
for (let i = 0; i < 40; i++) {
  last = await page.evaluate(
    async (id) => (await fetch(`/api/scrape-tasks/${id}/step`, { method: "POST" })).json(),
    taskId
  );
  console.log(`  [${i}] status=${last.status} total=${last.totalCount} found=${last.foundCount} :: ${last.message || last.error}`);
  if (["DONE", "ERROR", "CANCELLED"].includes(last.status)) break;
}

if (last.status !== "DONE") {
  console.error(`[${zone} / ${keyword}] FALLO: terminó en ${last.status} — ${last.error}`);
  process.exit(1);
}
console.log(`[${zone} / ${keyword}] OK — completado, ${last.foundCount} negocios guardados.`);
await browser.close();
