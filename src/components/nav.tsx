"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, LogOut, PhoneCall, Radar, Search, Users } from "lucide-react";
import { signOutAction } from "@/lib/actions/auth-actions";
import { ClockWidget } from "@/components/clock-widget";

export function Nav({ user }: { user: { name: string; email: string; role: string } }) {
  const pathname = usePathname();

  const links = [
    { href: "/call-mode", label: "Llamar", icon: PhoneCall },
    { href: "/businesses", label: "Negocios", icon: Building2 },
    { href: "/scrape", label: "Buscar", icon: Search },
    ...(user.role === "ADMIN"
      ? [
          { href: "/admin/stats", label: "Estadísticas", icon: BarChart3 },
          { href: "/admin/users", label: "Usuarios", icon: Users },
        ]
      : []),
  ];

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-5 backdrop-blur-sm">
      <div className="flex items-center gap-7">
        <Link href="/" prefetch={false} className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-sm shadow-blue-950/50">
            <Radar className="h-4 w-4 text-white" strokeWidth={2.25} />
          </span>
          <span className="text-[13px] font-semibold tracking-tight text-slate-100">
            Consola<span className="text-slate-500"> de negocios</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname === l.href || pathname?.startsWith(l.href + "/");
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                prefetch={false}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? "bg-slate-800/80 text-slate-100"
                    : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <ClockWidget />
        <div className="flex items-center gap-2 rounded-md border border-slate-800/80 bg-slate-900/60 py-1 pl-1 pr-3">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
            {user.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="text-left leading-tight">
            <div className="text-xs font-medium text-slate-200">{user.name}</div>
            <div className="text-[10px] text-slate-500">
              {user.role === "ADMIN" ? "Administrador" : "Agente"}
            </div>
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            title="Cerrar sesión"
            className="flex items-center gap-1.5 rounded-md border border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:text-slate-200"
          >
            <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </form>
      </div>
    </header>
  );
}
