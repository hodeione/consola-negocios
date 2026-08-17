import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail, emailShell } from "@/lib/email";
import { getAgentStats, defaultRange } from "@/lib/admin-stats";

export const runtime = "nodejs";
export const maxDuration = 30;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function appOrigin(): string {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

/** Un correo semanal para los admins: resumen del equipo de los últimos 7 días. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { from, to } = defaultRange(7);
  const agents = await getAgentStats(from, to);
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } });
  if (admins.length === 0) return NextResponse.json({ sent: 0, reason: "sin admins activos" });

  const totalCalls = agents.reduce((a, x) => a + x.callsInRange, 0);
  const totalHours = Math.round(agents.reduce((a, x) => a + x.hoursInRange, 0) * 10) / 10;
  const totalRevenue = agents.reduce((a, x) => a + x.revenueInRange, 0);
  const totalDeals = agents.reduce((a, x) => a + x.dealsInRange, 0);

  const rows = [...agents]
    .sort((a, b) => b.callsInRange - a.callsInRange)
    .map(
      (a) =>
        `<tr>
           <td style="padding:6px 0; color:#e8edf4; font-size:13px;">${a.name}</td>
           <td style="padding:6px 0; color:#93a3b8; font-size:12px; text-align:right;">${a.callsInRange} llam.</td>
           <td style="padding:6px 0; color:#93a3b8; font-size:12px; text-align:right;">${a.hoursInRange}h</td>
           <td style="padding:6px 0; color:#34d399; font-size:12px; text-align:right;">${a.revenueInRange > 0 ? a.revenueInRange.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—"}</td>
         </tr>`
    )
    .join("");

  let sent = 0;
  for (const admin of admins) {
    const result = await sendEmail({
      to: admin.email,
      subject: `Resumen semanal — ${totalCalls} llamadas, ${totalDeals} ventas`,
      html: emailShell(
        "Resumen de la semana",
        `
          <p style="color:#93a3b8; font-size:14px; line-height:1.6;">
            Últimos 7 días: <strong style="color:#e8edf4;">${totalCalls}</strong> llamadas,
            <strong style="color:#e8edf4;">${totalHours}h</strong> fichadas,
            <strong style="color:#34d399;">${totalRevenue.toLocaleString("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })}</strong>
            en ${totalDeals} venta(s).
          </p>
          <table style="width:100%; border-collapse:collapse; margin-top:12px;">${rows}</table>
          <a href="${appOrigin()}/admin/stats" style="display:inline-block; margin-top:18px; background:#2563eb; color:#fff; padding:9px 18px; border-radius:8px; text-decoration:none; font-size:13px; font-weight:600;">
            Ver estadísticas completas
          </a>
        `
      ),
    });
    if (result.sent) sent++;
  }

  return NextResponse.json({ sent, totalCalls, totalHours, totalRevenue, totalDeals });
}
