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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function launchOnce(): Promise<Browser> {
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
 *
 * Con reintento: en contenedores calientes, `@sparticuz/chromium` extrae el
 * binario a /tmp la primera vez que se usa; si dos invocaciones caen casi a
 * la vez en el mismo contenedor, una puede intentar ejecutar el binario
 * mientras la otra todavía lo está escribiendo (`spawn ETXTBSY`, visto en
 * producción). Es transitorio — un par de reintentos con una pequeña espera
 * lo resuelve.
 */
export async function launchBrowser(): Promise<Browser> {
  const attempts = 3;
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await launchOnce();
    } catch (err) {
      lastError = err;
      const isRace = err instanceof Error && /ETXTBSY|ENOENT/.test(err.message);
      if (!isRace || i === attempts - 1) throw err;
      await sleep(400 * (i + 1));
    }
  }
  throw lastError;
}

export const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
