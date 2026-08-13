import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

await page.goto("https://consola-negocios.vercel.app/login");
await page.fill('input[name="email"]', "hodeione41@gmail.com");
await page.fill('input[name="password"]', "agente1234");
await Promise.all([
  page.waitForURL("**/", { timeout: 15000 }),
  page.click('button[type="submit"]'),
]);
console.log("Login OK");

await page.goto("https://consola-negocios.vercel.app/scrape");
await page.fill("textarea >> nth=0", "Burgos España");
await page.fill("textarea >> nth=1", "cerrajero");
await page.fill('input[type="number"]', "3");
await page.locator("aside form button[type='submit']").click();
console.log("Lote enviado, esperando la tarjeta de ESTA tarea concretamente...");

// Acota al bloque de la tarea recién creada (el primer batch card de la lista)
const batchCard = page.locator(".surface").filter({ hasText: "cerrajero" }).first();
await batchCard.waitFor({ timeout: 10000 });

let done = false;
let lastStatus = "";
for (let i = 0; i < 70 && !done; i++) {
  const statusBadge = await batchCard.locator("span.rounded-full").last().innerText().catch(() => "");
  const msg = await batchCard.locator(".text-slate-500").first().innerText().catch(() => "");
  if (statusBadge !== lastStatus) {
    lastStatus = statusBadge;
    console.log(`  [t+${i * 3}s] estado="${statusBadge}" mensaje="${msg}"`);
  }
  done = statusBadge === "Completado";
  if (statusBadge === "Error") {
    console.error("FALLO: la tarea terminó en Error:", msg);
    process.exit(1);
  }
  if (!done) await page.waitForTimeout(3000);
}

if (!done) {
  console.error("FALLO: la tarea de Burgos no llegó a Completado en tiempo");
  process.exit(1);
}
console.log("Tarea de Burgos completada según la UI.");

// Verificación independiente: comprobar que hay negocios reales de Burgos España
await page.goto("https://consola-negocios.vercel.app/businesses");
await page.fill('input[placeholder*="Buscar"]', "");
await page.fill('input[placeholder="Zona"]', "Burgos España");
await page.waitForTimeout(1000);
const rowCount = await page.locator("tbody tr").count();
console.log("Filas de Burgos España en /businesses:", rowCount);
if (rowCount === 0) {
  console.error("FALLO: la UI dice completado pero no hay negocios de Burgos guardados");
  process.exit(1);
}

console.log("\nOK CONFIRMADO: la búsqueda funciona de verdad en producción (UI + datos guardados).");
await browser.close();
