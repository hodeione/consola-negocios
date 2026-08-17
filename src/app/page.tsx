import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  Phone,
  PhoneCall,
  Radar,
  Sparkles,
  Timer,
  Trophy,
} from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/api-auth";
import { buildBusinessWhere } from "@/lib/businesses/filters";
import { STATUS_BADGE, STATUS_LABEL } from "@/lib/businesses/labels";
import type { ScrapeTaskStatus } from "@/generated/prisma/enums";

const TERMINAL_STATUSES: ScrapeTaskStatus[] = ["DONE", "ERROR", "CANCELLED"];
const TERMINAL = new Set<string>(TERMINAL_STATUSES);

export default async function Home() {
  const user = await requireUser();
  if (!user) redirect("/login");

  const where = buildBusinessWhere({}, user);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const taskScope = user.role === "ADMIN" ? {} : { ownerId: user.id };

  const [total, byStatusRaw, dueSoon, activeTasks, recentBatches, callsToday, todaysEntries] = await Promise.all([
    prisma.business.count({ where }),
    prisma.business.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.business.findMany({
      where: { ...where, nextFollowUpAt: { lte: endOfToday } },
      orderBy: { nextFollowUpAt: "asc" },
      take: 5,
      select: { id: true, name: true, zone: true, mapsPhone: true, status: true, nextFollowUpAt: true },
    }),
    prisma.scrapeTask.findMany({
      where: { ...taskScope, status: { notIn: TERMINAL_STATUSES } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, keyword: true, zone: true, status: true, message: true },
    }),
    prisma.batchJob.findMany({
      where: taskScope,
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { tasks: { select: { status: true, foundCount: true } } },
    }),
    // Actividad propia de hoy — esta sí es siempre "tuya", agente o admin.
    prisma.callActivity.count({
      where: { userId: user.id, createdAt: { gte: startOfToday, lte: endOfToday } },
    }),
    prisma.timeEntry.findMany({
      where: { userId: user.id, clockIn: { lte: endOfToday }, OR: [{ clockOut: null }, { clockOut: { gte: startOfToday } }] },
      select: { clockIn: true, clockOut: true },
    }),
  ]);

  const hoursToday =
    todaysEntries.reduce((acc, e) => {
      const overlapStart = Math.max(e.clockIn.getTime(), startOfToday.getTime());
      const overlapEnd = Math.min((e.clockOut ?? new Date()).getTime(), endOfToday.getTime());
      return acc + Math.max(0, overlapEnd - overlapStart);
    }, 0) / 3_600_000;
  const hoursTodayLabel = hoursToday >= 0.05 ? `${hoursToday.toFixed(1)}h` : "0h";

  const byStatus = Object.fromEntries(byStatusRaw.map((s) => [s.status, s._count._all]));
  const firstName = user.name.split(" ")[0];
  const today = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        {/* ── Cabecera ─────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium capitalize text-slate-500">{today}</p>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-100">
              Hola, {firstName}
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/scrape"
              prefetch={false}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500"
            >
              <Radar className="h-4 w-4" strokeWidth={2.25} />
              Nueva búsqueda
            </Link>
            <Link
              href="/businesses"
              prefetch={false}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              Ver negocios
              <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
            </Link>
          </div>
        </div>

        {/* ── KPIs ─────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Negocios" value={total} icon={Sparkles} tone="blue" />
          <Kpi label="Toca llamar hoy" value={dueSoon.length} icon={CalendarClock} tone="amber" />
          <Kpi label="Interesados" value={byStatus.INTERESTED ?? 0} icon={PhoneCall} tone="emerald" />
          <Kpi label="Clientes" value={byStatus.CUSTOMER ?? 0} icon={Trophy} tone="purple" />
        </div>

        {/* ── Tu actividad de hoy ──────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="Tus llamadas hoy" value={callsToday} icon={Phone} tone="blue" />
          <Kpi label="Tus horas fichadas hoy" value={hoursTodayLabel} icon={Timer} tone="emerald" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          {/* ── Toca llamar hoy ────────────────────── */}
          <section className="surface flex flex-col p-5 lg:col-span-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Toca llamar hoy</h2>
              <Link href="/businesses" prefetch={false} className="text-xs font-medium text-blue-400 hover:text-blue-300">
                Ver todos →
              </Link>
            </div>
            {dueSoon.length === 0 ? (
              <EmptyRow text="Nada pendiente de llamar por hoy. 🎉" />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-800/70">
                {dueSoon.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-slate-200">{b.name}</div>
                      <div className="truncate text-xs text-slate-500">
                        {b.zone} {b.mapsPhone && `· ${b.mapsPhone}`}
                      </div>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[b.status]}`}>
                      {STATUS_LABEL[b.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Actividad de scraping ──────────────── */}
          <section className="surface flex flex-col p-5 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-100">Búsquedas recientes</h2>
            {recentBatches.length === 0 ? (
              <EmptyRow text="Todavía no has lanzado ninguna búsqueda." />
            ) : (
              <ul className="flex flex-col divide-y divide-slate-800/70">
                {recentBatches.map((batch) => {
                  const found = batch.tasks.reduce((acc, t) => acc + t.foundCount, 0);
                  const running = batch.tasks.some((t) => !TERMINAL.has(t.status));
                  return (
                    <li key={batch.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-200">
                          {batch.zones.slice(0, 2).join(", ")}
                          {batch.zones.length > 2 && ` +${batch.zones.length - 2}`}
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {batch.keywords.filter(Boolean).join(", ") || "todos los tipos"}
                        </div>
                      </div>
                      <span
                        className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          running ? "bg-blue-900 text-blue-300" : "bg-emerald-900 text-emerald-300"
                        }`}
                      >
                        {running ? "en curso" : `${found} con contacto`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {activeTasks.length > 0 && (
              <Link
                href="/scrape"
                prefetch={false}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-blue-900 bg-blue-950/50 py-2 text-xs font-medium text-blue-300 hover:bg-blue-950"
              >
                {activeTasks.length} tarea(s) en curso — ir a /scrape →
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  tone: "blue" | "amber" | "emerald" | "purple";
}) {
  const toneClasses: Record<string, string> = {
    blue: "bg-blue-500/10 text-blue-400",
    amber: "bg-amber-500/10 text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-400",
    purple: "bg-purple-500/10 text-purple-400",
  };
  return (
    <div className="surface flex items-center gap-3 p-4">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${toneClasses[tone]}`}>
        <Icon className="h-4.5 w-4.5" strokeWidth={2} />
      </span>
      <div>
        <div className="text-xl font-semibold text-slate-100">{value}</div>
        <div className="text-[11px] text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="py-6 text-center text-xs text-slate-600">{text}</p>;
}
