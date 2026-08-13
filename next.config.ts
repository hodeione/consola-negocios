import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deja Chromium + Playwright fuera del bundle del servidor para que el
  // trazador de Next no intente incluir el binario de Chromium (~50MB).
  // Se cargan en tiempo de ejecución desde node_modules, no desde el bundle.
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "playwright"],
};

export default nextConfig;
