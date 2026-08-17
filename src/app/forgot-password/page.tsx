import { Mail, MailCheck, Radar } from "lucide-react";
import Link from "next/link";
import { forgotPasswordAction } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;

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
            <p className="mt-0.5 text-xs text-slate-500">Recuperar contraseña</p>
          </div>
        </div>

        <div className="surface-solid p-7">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-2 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
                <MailCheck className="h-5 w-5" strokeWidth={2.25} />
              </span>
              <p className="text-sm text-slate-300">
                Si ese email tiene una cuenta activa, te hemos enviado un enlace para elegir una
                contraseña nueva. Caduca en 1 hora.
              </p>
            </div>
          ) : (
            <form action={forgotPasswordAction} className="space-y-4">
              <p className="text-xs text-slate-500">
                Te enviamos un enlace de un solo uso para elegir una contraseña nueva.
              </p>
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
              <button
                type="submit"
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500"
              >
                Enviar enlace
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-600">
          <Link href="/login" className="text-slate-500 hover:text-slate-300">
            ← Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
