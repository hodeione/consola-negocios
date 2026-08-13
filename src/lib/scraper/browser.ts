import { chromium, type Browser } from "playwright-core";

let browserInstance: Browser | null = null;

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

export async function getBrowser(): Promise<Browser> {
  if (browserInstance?.isConnected()) return browserInstance;

  if (isServerless()) {
    // Import dinámico: mantiene el paquete (~50MB) fuera del bundle local.
    const { default: chromiumServerless } = await import("@sparticuz/chromium");
    browserInstance = await chromium.launch({
      headless: true,
      args: chromiumServerless.args,
      executablePath: await chromiumServerless.executablePath(),
    });
  } else {
    browserInstance = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browserInstance;
}

export async function closeBrowser(): Promise<void> {
  if (browserInstance?.isConnected()) {
    await browserInstance.close();
    browserInstance = null;
  }
}

export const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
