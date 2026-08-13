import { AlertCircle, Lock, Mail, Radar } from "lucide-react";
import { loginAction } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { error, callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-950/50">
            <Radar className="h-5 w-5 text-white" strokeWidth={2.25} />
          </span>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-100">
              Consola <span className="text-slate-500">de negocios</span>
            </h1>
            <p className="mt-0.5 text-xs text-slate-500">Inicia sesión para continuar</p>
          </div>
        </div>

        <div className="surface-solid p-7">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" strokeWidth={2.25} />
              Email o contraseña incorrectos.
            </div>
          )}

          <form action={loginAction} className="space-y-4">
            <input type="hidden" name="callbackUrl" value={callbackUrl || "/"} />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" strokeWidth={2} />
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Contraseña</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" strokeWidth={2} />
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500"
            >
              Entrar
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          ¿No tienes cuenta? Pídele a un administrador que te dé de alta desde{" "}
          <span className="text-slate-500">/admin/users</span>.
        </p>
      </div>
    </div>
  );
}
