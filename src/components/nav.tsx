import Link from "next/link";
import { signOutAction } from "@/lib/actions/auth-actions";

export function Nav({ user }: { user: { name: string; email: string; role: string } }) {
  const links = [
    { href: "/businesses", label: "Negocios" },
    { href: "/scrape", label: "Buscar" },
    ...(user.role === "ADMIN" ? [{ href: "/admin/users", label: "Usuarios" }] : []),
  ];

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-5">
      <div className="flex items-center gap-6">
        <span className="text-sm font-semibold text-slate-100">
          🔎 Consola de negocios
        </span>
        <nav className="flex gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              prefetch={false}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-800 hover:text-slate-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right leading-tight">
          <div className="text-xs font-medium text-slate-200">{user.name}</div>
          <div className="text-[10px] text-slate-500">
            {user.role === "ADMIN" ? "Administrador" : "Agente"}
          </div>
        </div>
        <form action={signOutAction}>
          <button
            type="submit"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-600 hover:text-slate-100"
          >
            Salir
          </button>
        </form>
      </div>
    </header>
  );
}
