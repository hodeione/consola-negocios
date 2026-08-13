# Despliegue en Vercel + Neon

## 1. Base de datos (Neon)

1. Crea un proyecto en [neon.tech](https://neon.tech) (o usa la integración
   "Neon Postgres" desde el propio dashboard de Vercel — Storage → Create
   Database → Neon).
2. Copia dos connection strings del panel de Neon:
   - **Pooled** (host con sufijo `-pooler`) → `DATABASE_URL`.
   - **Direct** (sin `-pooler`) → `DIRECT_DATABASE_URL` (por si en el futuro
     se necesita para migraciones; hoy no se usa activamente).
3. Aplica las migraciones contra esa base de datos **una vez**, desde tu
   máquina, apuntando `DATABASE_URL` a la Neon real:
   ```bash
   DATABASE_URL="<pooled-connection-string>" npx prisma migrate deploy
   ```
4. Siembra el primer admin (usa las mismas env vars que en local, pero con
   `DATABASE_URL` apuntando a Neon):
   ```bash
   DATABASE_URL="<pooled>" SEED_ADMIN_EMAIL="tú@empresa.com" \
     SEED_ADMIN_PASSWORD="una-contraseña-fuerte" SEED_ADMIN_NAME="Tu nombre" \
     npx tsx prisma/seed.ts
   ```

## 2. Proyecto en Vercel

1. Sube este repo a GitHub (o el remoto que prefieras) y conéctalo desde
   [vercel.com/new](https://vercel.com/new). Root directory: `web/` si el
   repo incluye también el scraper Python antiguo en la raíz; si el repo
   *es* directamente esta carpeta, déjalo en blanco.
2. Framework preset: Next.js (detectado automáticamente).
3. **Variables de entorno** (Project Settings → Environment Variables):

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | connection string *pooled* de Neon |
   | `AUTH_SECRET` | genera una nueva y distinta a la de local: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
   | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME` | solo necesarias si vas a correr el seed *desde* Vercel; si ya sembraste el admin en el paso 1 desde tu máquina, no hacen falta aquí |

   No hace falta `AUTH_TRUST_HOST` ni tocar `trustHost` — el código ya lo
   fuerza a `true`, lo cual es un no-op seguro en Vercel (Auth.js ya confía
   en su propio host) y es lo que permite que funcione igual si algún día
   se autohospeda fuera de Vercel.

4. Plan: las funciones de scraping (`/api/scrape-tasks/[id]/step`) declaran
   `maxDuration = 60` y 3 GB de memoria (`vercel.json`). El plan **Hobby**
   permite duración de función hasta ese rango con Fluid Compute (activado
   por defecto en proyectos nuevos); si tu cuenta es más antigua o ves
   timeouts, pasa a **Pro** o reduce `maxDuration`.
5. Despliega. El build corre `prisma generate` automáticamente
   (`postinstall`), pero **no** aplica migraciones — eso se hace a mano
   (paso 1.3) o añadiendo `npx prisma migrate deploy &&` delante del
   `Build Command` en Project Settings si prefieres que se aplique en cada
   deploy.

## 3. Verificación post-deploy

1. Entra con el admin sembrado en `https://<tu-dominio>/login`.
2. Lanza una búsqueda pequeña en `/scrape` (1 zona, `maxResults` bajo) y
   comprueba que llega a "Completado".
3. Comprueba que el negocio aparece en `/businesses`, que puedes registrar
   una llamada y exportar a Excel.
4. Da de alta un agente de prueba desde `/admin/users` y confirma que solo
   ve lo que se le asigna.
5. Borra los datos de prueba (o dales al agente/negocio de prueba un uso
   real) antes de repartir el acceso al equipo.

## Notas

- El plan Hobby de Vercel no soporta dominios de equipo con SSO ni límites
  de invitados avanzados — para varios agentes con cuentas separadas dentro
  de Vercel (no dentro de la app) necesitarías un plan superior, pero eso es
  independiente de que la propia app ya sea multiusuario.
- Si más adelante quieres que las tareas de scraping sigan avanzando aunque
  nadie tenga la pestaña de `/scrape` abierta, la vía es añadir un
  disparador externo (Vercel Cron o una cola tipo Upstash QStash) que llame
  a `/api/scrape-tasks/[id]/step` periódicamente para las tareas no
  terminadas — hoy el avance lo dirige el navegador mientras la pestaña
  está abierta, y se reanuda solo al volver a abrirla.
