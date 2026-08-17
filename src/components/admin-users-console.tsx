"use client";

import { useState } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  CircleAlert,
  History,
  KeyRound,
  Loader2,
  Mail,
  Radar,
  ShieldCheck,
  StickyNote,
  Users,
  UserPlus,
} from "lucide-react";
import { queuedFetch } from "@/lib/fetch-queue";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "AGENT";
  active: boolean;
  createdAt: string | Date;
  _count: { assignedBusiness: number };
}

interface SystemHealth {
  lastTask: { updatedAt: string; label: string; status: string } | null;
  openEntries: number;
  staleCount: number;
  totalBusinesses: number;
  scrapingEnabled: boolean;
  emailConfigured: boolean;
  cronSecretConfigured: boolean;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

async function errorMessageFrom(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return data?.error || `Error ${res.status}`;
  } catch {
    return `Error ${res.status}`;
  }
}

export function AdminUsersConsole({
  initialUsers,
  currentUserId,
  health,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
  health: SystemHealth;
}) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function patchUser(updated: AdminUser) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
  }

  async function updateUser(id: string, patch: Partial<{ role: string; active: boolean; password: string }>) {
    setError(null);
    try {
      const res = await queuedFetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await errorMessageFrom(res));
      patchUser(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
            <Users className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-slate-100">Usuarios</h1>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" strokeWidth={2.25} />
            {notice}
          </div>
        )}

        <HealthPanel health={health} />

        <NewUserForm
          onCreated={(u) => {
            setUsers((prev) => [...prev, u]);
            setNotice(`Usuario ${u.email} creado.`);
          }}
          onError={setError}
        />

        <section className="surface overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900/60 text-left text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5">Nombre</th>
                <th className="px-4 py-2.5">Email</th>
                <th className="px-4 py-2.5">Rol</th>
                <th className="px-4 py-2.5">Negocios asignados</th>
                <th className="px-4 py-2.5">Estado</th>
                <th className="px-4 py-2.5">Contraseña</th>
                <th className="px-4 py-2.5">Accesos</th>
                <th className="px-4 py-2.5">Notas</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} onUpdate={updateUser} />
              ))}
            </tbody>
          </table>
        </section>

        <ReassignPanel
          users={users}
          onDone={async (count, fromEmail, toLabel) => {
            setNotice(`${count} negocio(s) reasignados de ${fromEmail} a ${toLabel}.`);
            setError(null);
            const res = await queuedFetch("/api/admin/users");
            if (res.ok) setUsers(await res.json());
          }}
          onError={setError}
        />
      </div>
    </div>
  );
}

function HealthPanel({ health }: { health: SystemHealth }) {
  return (
    <section className="surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
        <h2 className="text-sm font-semibold text-slate-100">Salud del sistema</h2>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <HealthTile
          icon={Radar}
          label="Última búsqueda"
          value={health.lastTask ? new Date(health.lastTask.updatedAt).toLocaleDateString("es-ES") : "nunca"}
          hint={health.lastTask?.label}
        />
        <HealthTile
          icon={History}
          label="Fichajes abiertos"
          value={String(health.openEntries)}
          warn={health.openEntries > 0}
        />
        <HealthTile
          icon={CircleAlert}
          label="Datos desactualizados"
          value={`${health.staleCount} / ${health.totalBusinesses}`}
          warn={health.staleCount > 0}
        />
        <HealthTile
          icon={Mail}
          label="Email"
          value={health.emailConfigured ? "configurado" : "solo log"}
          warn={!health.emailConfigured}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
        <span>
          Scraping en la nube:{" "}
          <span className={health.scrapingEnabled ? "text-emerald-400" : "text-slate-400"}>
            {health.scrapingEnabled ? "activado" : "desactivado (kill switch)"}
          </span>
        </span>
        <span>·</span>
        <span>
          Cron protegido:{" "}
          <span className={health.cronSecretConfigured ? "text-emerald-400" : "text-amber-400"}>
            {health.cronSecretConfigured ? "sí (CRON_SECRET)" : "no — cualquiera podría llamarlo"}
          </span>
        </span>
      </div>
    </section>
  );
}

function HealthTile({
  icon: Icon,
  label,
  value,
  hint,
  warn,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  value: string;
  hint?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-slate-900/60 p-3">
      <div className="mb-1 flex items-center gap-1.5 text-slate-500">
        <Icon className="h-3 w-3" strokeWidth={2.25} />
        <span className="text-[10px]">{label}</span>
      </div>
      <div className={`text-sm font-semibold ${warn ? "text-amber-400" : "text-slate-200"}`}>{value}</div>
      {hint && <div className="truncate text-[10px] text-slate-600">{hint}</div>}
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  onUpdate,
}: {
  user: AdminUser;
  isSelf: boolean;
  onUpdate: (id: string, patch: Partial<{ role: string; active: boolean; password: string }>) => void;
}) {
  const [resetting, setResetting] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showEvents, setShowEvents] = useState(false);
  const [events, setEvents] = useState<{ id: string; ip: string; userAgent: string; createdAt: string }[] | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState<{ id: string; body: string; createdAt: string; author: { name: string } }[] | null>(null);
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  async function toggleEvents() {
    if (showEvents) {
      setShowEvents(false);
      return;
    }
    setShowEvents(true);
    if (events === null) {
      const res = await queuedFetch(`/api/admin/users/${user.id}/login-events`);
      if (res.ok) setEvents(await res.json());
    }
  }

  async function loadNotes() {
    const res = await queuedFetch(`/api/admin/users/${user.id}/notes`);
    if (res.ok) setNotes(await res.json());
  }

  async function toggleNotes() {
    if (showNotes) {
      setShowNotes(false);
      return;
    }
    setShowNotes(true);
    if (notes === null) await loadNotes();
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSavingNote(true);
    try {
      const res = await queuedFetch(`/api/admin/users/${user.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote }),
      });
      if (res.ok) {
        const created = await res.json();
        setNotes((prev) => [created, ...(prev ?? [])]);
        setNewNote("");
      }
    } finally {
      setSavingNote(false);
    }
  }

  return (
    <>
    <tr className="border-t border-slate-800/70">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-slate-300">
            {initials(user.name)}
          </span>
          <span className="text-slate-100">{user.name}</span>
          {isSelf && <span className="text-xs text-slate-500">(tú)</span>}
        </div>
      </td>
      <td className="px-4 py-2.5 text-slate-400">{user.email}</td>
      <td className="px-4 py-2.5">
        <select
          value={user.role}
          disabled={isSelf}
          onChange={(e) => onUpdate(user.id, { role: e.target.value })}
          className="rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500 disabled:opacity-40"
        >
          <option value="AGENT">Agente</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </td>
      <td className="px-4 py-2.5 text-slate-300">{user._count.assignedBusiness}</td>
      <td className="px-4 py-2.5">
        <button
          disabled={isSelf}
          onClick={() => onUpdate(user.id, { active: !user.active })}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-40 ${
            user.active
              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              : "bg-slate-500/10 text-slate-500 border border-slate-500/20"
          }`}
        >
          {user.active ? "Activo" : "Desactivado"}
        </button>
      </td>
      <td className="px-4 py-2.5">
        {resetting ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newPassword.length < 8) return;
              onUpdate(user.id, { password: newPassword });
              setNewPassword("");
              setResetting(false);
            }}
            className="flex items-center gap-1"
          >
            <input
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Nueva (mín. 8)"
              className="w-28 rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-blue-500"
            />
            <button type="submit" className="text-xs font-semibold text-blue-400 hover:text-blue-300">
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setResetting(false)}
              className="text-xs text-slate-500 hover:text-slate-300"
            >
              Cancelar
            </button>
          </form>
        ) : (
          <button
            onClick={() => setResetting(true)}
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <KeyRound className="h-3 w-3" strokeWidth={2.25} />
            Restablecer…
          </button>
        )}
      </td>
      <td className="px-4 py-2.5">
        <button onClick={toggleEvents} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200">
          <History className="h-3 w-3" strokeWidth={2.25} />
          {showEvents ? "Ocultar" : "Ver"}
        </button>
      </td>
      <td className="px-4 py-2.5">
        <button onClick={toggleNotes} className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-slate-200">
          <StickyNote className="h-3 w-3" strokeWidth={2.25} />
          {showNotes ? "Ocultar" : "Ver"}
        </button>
      </td>
    </tr>
    {showEvents && (
      <tr className="border-t border-slate-800/50 bg-slate-950/40">
        <td colSpan={8} className="px-4 py-3">
          {events === null ? (
            <p className="text-xs text-slate-600">Cargando…</p>
          ) : events.length === 0 ? (
            <p className="text-xs text-slate-600">Sin accesos registrados todavía.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs text-slate-400">
              {events.map((e) => (
                <li key={e.id} className="flex items-center gap-3">
                  <span className="font-mono tabular-nums text-slate-500">
                    {new Date(e.createdAt).toLocaleString("es-ES")}
                  </span>
                  {e.ip && <span>{e.ip}</span>}
                  <span className="truncate text-slate-600">{e.userAgent}</span>
                </li>
              ))}
            </ul>
          )}
        </td>
      </tr>
    )}
    {showNotes && (
      <tr className="border-t border-slate-800/50 bg-slate-950/40">
        <td colSpan={8} className="px-4 py-3">
          <form onSubmit={addNote} className="mb-3 flex items-end gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Nota privada sobre el desempeño de esta persona (solo la ven los admins)…"
              rows={2}
              className="flex-1 resize-y rounded-md border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={savingNote || !newNote.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-500 disabled:opacity-50"
            >
              {savingNote ? "…" : "Añadir"}
            </button>
          </form>
          {notes === null ? (
            <p className="text-xs text-slate-600">Cargando…</p>
          ) : notes.length === 0 ? (
            <p className="text-xs text-slate-600">Sin notas todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {notes.map((n) => (
                <li key={n.id} className="rounded-md bg-slate-900/60 p-2 text-xs">
                  <p className="text-slate-300">{n.body}</p>
                  <p className="mt-1 text-[10px] text-slate-600">
                    {n.author.name} · {new Date(n.createdAt).toLocaleString("es-ES")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </td>
      </tr>
    )}
    </>
  );
}

function NewUserForm({
  onCreated,
  onError,
}: {
  onCreated: (u: AdminUser) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("AGENT");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await queuedFetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      });
      if (!res.ok) throw new Error(await errorMessageFrom(res));
      const created = await res.json();
      onCreated({ ...created, _count: { assignedBusiness: 0 } });
      setName("");
      setEmail("");
      setPassword("");
      setRole("AGENT");
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="surface flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Nombre</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-40 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-52 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Contraseña</label>
        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="mín. 8 caracteres"
          className="w-40 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Rol</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
        >
          <option value="AGENT">Agente</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-950/40 transition hover:bg-blue-500 disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <UserPlus className="h-4 w-4" strokeWidth={2.25} />}
        {submitting ? "Creando…" : "Nuevo usuario"}
      </button>
    </form>
  );
}

function ReassignPanel({
  users,
  onDone,
  onError,
}: {
  users: AdminUser[];
  onDone: (count: number, fromEmail: string, toLabel: string) => void;
  onError: (msg: string) => void;
}) {
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromUserId) return;
    setBusy(true);
    try {
      const res = await queuedFetch("/api/admin/users/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromUserId, toUserId: toUserId || null }),
      });
      if (!res.ok) throw new Error(await errorMessageFrom(res));
      const { reassigned } = await res.json();
      const fromEmail = users.find((u) => u.id === fromUserId)?.email ?? fromUserId;
      const toLabel = toUserId ? users.find((u) => u.id === toUserId)?.email ?? toUserId : "sin asignar";
      onDone(reassigned, fromEmail, toLabel);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="surface p-4">
      <div className="mb-1 flex items-center gap-2">
        <ArrowRightLeft className="h-3.5 w-3.5 text-slate-500" strokeWidth={2.25} />
        <h2 className="text-sm font-semibold text-slate-100">Reasignación masiva</h2>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        Mueve de golpe todos los negocios de un agente a otro — útil cuando alguien deja el equipo.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">De</label>
          <select
            required
            value={fromUserId}
            onChange={(e) => setFromUserId(e.target.value)}
            className="w-52 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="" disabled>
              Elige un agente…
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u._count.assignedBusiness})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">A</label>
          <select
            value={toUserId}
            onChange={(e) => setToUserId(e.target.value)}
            className="w-52 rounded-lg border border-slate-800 bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-blue-500"
          >
            <option value="">Sin asignar</option>
            {users
              .filter((u) => u.id !== fromUserId)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={busy || !fromUserId}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-950/40 transition hover:bg-amber-500 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.5} /> : <ArrowRightLeft className="h-4 w-4" strokeWidth={2.25} />}
          {busy ? "Reasignando…" : "Reasignar todos"}
        </button>
      </form>
    </section>
  );
}
