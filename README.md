# Consola de negocios

Scraper de negocios de Google Maps por zona + consola CRM para gestionar el
seguimiento de llamadas. Next.js (App Router) + Prisma/Postgres + Auth.js.

## Qué hace

- **`/scrape`** — lanza búsquedas por lotes (varias zonas × varios tipos de
  negocio a la vez). Cada combinación se scrapea con Playwright: recoge
  fichas de Google Maps (nombre, dirección, teléfono, web, rating,
  categoría) y luego rastrea la web de cada negocio en busca de emails y
  teléfonos adicionales.
- **`/businesses`** — consola CRM: tabla filtrable/ordenable de todos los
  negocios, panel de detalle con historial de llamadas, edición de estado
  / prioridad / etiquetas / próxima llamada, acciones en lote y export a
  Excel.
- **`/admin/users`** (solo ADMIN) — alta de agentes, cambio de rol,
  activar/desactivar acceso, restablecer contraseña, reasignación masiva de
  cartera entre agentes.
- Cada `AGENT` solo ve los negocios que tiene asignados; el `ADMIN` ve y
  reasigna todo.

## Desarrollo local

Requisitos: Node 20.9+.

```bash
npm install                # instala dependencias (postinstall genera Prisma Client)
npm run db:dev              # levanta una Postgres local gestionada por Prisma
npm run db:migrate          # aplica las migraciones
npm run db:seed             # crea el usuario admin (usa SEED_ADMIN_* de .env)
npm run dev                 # http://localhost:3000
```

El `.env` de ejemplo ya apunta a la Postgres local de `db:dev`. Cambia
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` antes de sembrar en un entorno
que no sea tu máquina.

Comandos útiles:

- `npm run build` / `npm run lint` — verificación antes de desplegar.
- `npm run db:studio` — explorador visual de la base de datos.
- `npm run db:deploy` — aplica migraciones pendientes sin pedir confirmación
  interactiva (el que se usa en producción).

## Despliegue

Ver [`DEPLOY.md`](./DEPLOY.md).
