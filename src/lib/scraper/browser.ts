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
 * Kill switch: en Vercel el scraping consume Active CPU de la cuota del
 * plan (una función colgada/lanzada por error puede agotarla y pausar
 * TODOS los proyectos de la cuenta — nos pasó una vez con un script de
 * prueba viejo). A partir de ahora el scraping "grande" corre en local
 * (`npm run scrape:local`); las rutas serverless que lanzan Chromium
 * quedan desactivadas en producción por defecto y solo se reactivan
 * poniendo `SCRAPING_ENABLED=true` en las env vars del proyecto en
 * Vercel. En local (`npm run dev` o el script local) nunca aplica, para
 * no romper el flujo de desarrollo/pruebas habitual.
 */
export function isScrapingAllowed(): boolean {
  if (!isServerless()) return true;
  return process.env.SCRAPING_ENABLED === "true";
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
  // Última línea de defensa: aunque algo llame a esta función saltándose el
  // guard de la ruta API, en producción nunca llega a lanzar Chromium sin
  // el flag explícito.
  if (!isScrapingAllowed()) {
    throw new Error("SCRAPING_DISABLED_IN_PRODUCTION");
  }

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
