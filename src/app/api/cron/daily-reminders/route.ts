import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Vercel añade automáticamente `Authorization: Bearer $CRON_SECRET` a las
 * peticiones que dispara un cron configurado en vercel.json, si esa env var
 * existe. Sin CRON_SECRET configurado no se puede exigir nada — se deja
 * pasar (útil en local) pero se documenta como pendiente de poner en
 * producción antes de activar el cron de verdad.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Dominio de producción estable (Vercel lo expone aparte de la URL de cada
 * deploy, que cambia); en local cae a localhost. */
function appOrigin(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, email: true },
  });

  let emailsSent = 0;
  let usersWithNothingDue = 0;

  for (const user of users) {
    const dueBusinesses = await prisma.business.findMany({
      where: { assignedToUserId: user.id, nextFollowUpAt: { lte: endOfToday } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 20,
      select: { name: true, zone: true, mapsPhone: true },
    });

    if (dueBusinesses.length === 0) {
      usersWithNothingDue++;
      continue;
    }

    const rows = dueBusinesses
      .map(
        (b) =>
          `<tr>
             <td style="padding:6px 0; color:#e8edf4; font-size:13px;">${b.name}</td>
             <td style="padding:6px 0; color:#93a3b8; font-size:12px;">${b.zone}${b.mapsPhone ? ` · ${b.mapsPhone}` : ""}</td>
           </tr>`
      )
      .join("");

    const result = await sendEmail({
      to: user.email,
      subject: `${dueBusinesses.length} negocio(s) por llamar hoy`,
      html: emailShell(
        "Hoy toca llamar",
        `
          <p style="color:#93a3b8; font-size:14px; line-height:1.6;">
            Hola ${user.name.split(" ")[0]} — tienes ${dueBusinesses.length} negocio(s) con seguimiento
            pendiente para hoy o antes:
          </p>
          <table style="width:100%; border-collapse:collapse; margin-top:8px;">${rows}</table>
          <a href="${appOrigin()}/businesses" style="display:inline-block; margin-top:18px; background:#2563eb; color:#fff; padding:9px 18px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600;">
            Ver en la consola
          </a>
        `
      ),
    });
    if (result.sent) emailsSent++;
  }

  const forgottenClockInsSent = await notifyForgottenClockIns();

  return NextResponse.json({ usersChecked: users.length, emailsSent, usersWithNothingDue, forgottenClockInsSent });
}

const FORGOTTEN_CLOCK_IN_HOURS = 12;

/**
 * Fichajes que llevan abiertos demasiado tiempo (nadie fichó salida) — se
 * avisa a los admins, no a la propia persona, porque si se le olvidó fichar
 * salida probablemente tampoco vaya a ver el aviso hasta el día siguiente de
 * todos modos, y es al admin a quien le toca corregirlo desde /admin/stats.
 */
async function notifyForgottenClockIns(): Promise<number> {
  const cutoff = new Date();
  cutoff.setHours(cutoff.getHours() - FORGOTTEN_CLOCK_IN_HOURS);

  const openEntries = await prisma.timeEntry.findMany({
    where: { clockOut: null, clockIn: { lte: cutoff } },
    include: { user: { select: { name: true } } },
  });
  if (openEntries.length === 0) return 0;

  const adminUsers = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true, name: true } });
  if (adminUsers.length === 0) return 0;

  const rows = openEntries
    .map((e) => {
      const hours = Math.round((Date.now() - e.clockIn.getTime()) / 3_600_000);
      return `<tr>
        <td style="padding:6px 0; color:#e8edf4; font-size:13px;">${e.user.name}</td>
        <td style="padding:6px 0; color:#93a3b8; font-size:12px;">desde ${e.clockIn.toLocaleString("es-ES")} (${hours}h)</td>
      </tr>`;
    })
    .join("");

  let sent = 0;
  for (const admin of adminUsers) {
    const result = await sendEmail({
      to: admin.email,
      subject: `${openEntries.length} fichaje(s) sin cerrar hace más de ${FORGOTTEN_CLOCK_IN_HOURS}h`,
      html: emailShell(
        "Fichajes olvidados",
        `
          <p style="color:#93a3b8; font-size:14px; line-height:1.6;">
            Estos fichajes siguen abiertos desde hace más de ${FORGOTTEN_CLOCK_IN_HOURS} horas — probablemente
            alguien olvidó fichar salida:
          </p>
          <table style="width:100%; border-collapse:collapse; margin-top:8px;">${rows}</table>
          <a href="${appOrigin()}/admin/stats" style="display:inline-block; margin-top:18px; background:#2563eb; color:#fff; padding:9px 18px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600;">
            Corregir en Estadísticas
          </a>
        `
      ),
    });
    if (result.sent) sent++;
  }
  return sent;
}
