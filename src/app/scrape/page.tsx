import { redirect } from "next/navigation";

// La búsqueda en la nube está retirada de la interfaz: el scraping en
// Vercel sigue bloqueado por el kill switch (SCRAPING_ENABLED, ver
// src/lib/scraper/browser.ts) y el flujo real de trabajo es el scraper
// local (`npm run scrape:local`) + "Importar Excel" en /businesses. Se
// deja esta redirección en vez de borrar las rutas/API por si se quiere
// reactivar en el futuro.
export default function ScrapePage() {
  redirect("/businesses");
}
