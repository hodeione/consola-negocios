import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deja Chromium + Playwright fuera del bundle del servidor para que el
  // trazador de Next no intente incluir el binario de Chromium (~50MB).
  // Se cargan en tiempo de ejecución desde node_modules, no desde el bundle.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
  // Al marcarlos "external" arriba, el trazador de archivos de Next deja de
  // seguir sus imports — y con eso se le olvidan ficheros auxiliares que
  // playwright-core necesita en tiempo de ejecución aunque no sean JS
  // importado directamente (p.ej. browsers.json). Sin esto, en Vercel falla
  // con "Cannot find module '.../playwright-core/browsers.json'".
  outputFileTracingIncludes: {
    "/*": ["node_modules/playwright-core/**/*", "node_modules/@sparticuz/chromium/**/*"],
  },
};

export default nextConfig;
