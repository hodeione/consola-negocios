import { chromium, type Browser } from "playwright-core";

/**
 * Detecta un entorno serverless (Vercel / AWS Lambda). El `playwright`
 * completo descarga un Chromium de ~170MB que nunca cabe en una función de
 * Vercel; en serverless usamos `@sparticuz/chromium`, un build recortado
 * (~50MB comprimido) pensado para runtimes tipo Lambda. Mismo patrón que
 * `rgdpchecker/src/lib/pipeline/browser.ts`.
 */
function isServerless(): boolean {
  return !!(
    process.env.VERCEL ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.AWS_EXECUTION_ENV?.startsWith("AWS_Lambda")
  );
}

/**
 * Lanza SIEMPRE un navegador nuevo — a propósito no se comparte una única
 * instancia entre invocaciones. Se probó a reutilizarla (más rápido en el
 * caso feliz) pero en producción, en cuanto un paso fallaba a mitad
 * (timeout, página colgada…), la instancia compartida quedaba en un estado
 * degradado y arrastraba TODAS las peticiones siguientes que cayeran en el
 * mismo contenedor caliente (`ERR_INSUFFICIENT_RESOURCES`, "Target page,
 * context or browser has been closed" en peticiones que no tenían nada que
 * ver). Cada paso es corto (segundos), así que el coste de lanzar limpio
 * cada vez es aceptable a cambio de que un fallo nunca contamine el
 * siguiente intento.
 */
export async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    // Import dinámico: mantiene el paquete (~50MB) fuera del bundle local.
    const { default: chromiumServerless } = await import("@sparticuz/chromium");
    return chromium.launch({
      headless: true,
      args: chromiumServerless.args,
      executablePath: await chromiumServerless.executablePath(),
    });
  }
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

export const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
