// Next.js 16 renombró `middleware.ts` a `proxy.ts` (función exportada `proxy`).
// Aquí protegemos toda la app: sin sesión → /login; /admin/* sólo para ADMIN.
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// Accesibles sin sesión, además de /login: el flujo de "olvidé mi contraseña".
const PUBLIC_PATHS = new Set(["/login", "/forgot-password", "/reset-password"]);

export const proxy = auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const isAdmin = req.auth?.user?.role === "ADMIN";
  const isLoginPage = nextUrl.pathname === "/login";
  const isPublicPath = PUBLIC_PATHS.has(nextUrl.pathname);

  // Peticiones de fondo (prefetch de <Link>, revalidación especulativa del
  // router) nunca deben arrastrar la pestaña entera a /login si la sesión
  // no se resuelve a tiempo — sólo una navegación real de primer plano debe
  // poder redirigir. Se identifican por las cabeceras estándar que el propio
  // Next.js / los navegadores ponen en ese tipo de peticiones.
  const isBackgroundRequest =
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch" ||
    req.headers.get("sec-purpose")?.includes("prefetch");

  if (!isLoggedIn && !isPublicPath) {
    if (isBackgroundRequest) return NextResponse.next();
    const url = new URL("/login", nextUrl);
    url.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLoginPage) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }

  if (nextUrl.pathname.startsWith("/admin") && !isAdmin) {
    return NextResponse.redirect(new URL("/", nextUrl));
  }
});

export const config = {
  // Todo excepto assets estáticos, la propia API de auth y las rutas de
  // cron (Vercel las llama sin cookie de sesión — se autentican solas con
  // CRON_SECRET, ver src/app/api/cron/daily-reminders/route.ts).
  matcher: ["/((?!api/auth|api/cron|_next/static|_next/image|favicon.ico).*)"],
};
