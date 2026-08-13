"use client";

import { useState } from "react";
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
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
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
        <h1 className="text-lg font-semibold text-slate-100">Usuarios</h1>

        {error && (
          <div className="rounded-md border border-red-900 bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </div>
        )}
        {notice && (
          <div className="rounded-md border border-emerald-900 bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
            {notice}
          </div>
        )}

        <NewUserForm
          onCreated={(u) => {
            setUsers((prev) => [...prev, u]);
            setNotice(`Usuario ${u.email} creado.`);
          }}
          onError={setError}
        />

        <section className="overflow-hidden rounded-lg border border-slate-800">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-900 text-left text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Nombre</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Rol</th>
                <th className="px-4 py-2">Negocios asignados</th>
                <th className="px-4 py-2">Estado</th>
                <th className="px-4 py-2">Contraseña</th>
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

  return (
    <tr className="border-t border-slate-800">
      <td className="px-4 py-2.5 text-slate-100">
        {user.name} {isSelf && <span className="text-xs text-slate-500">(tú)</span>}
      </td>
      <td className="px-4 py-2.5 text-slate-400">{user.email}</td>
      <td className="px-4 py-2.5">
        <select
          value={user.role}
          disabled={isSelf}
          onChange={(e) => onUpdate(user.id, { role: e.target.value })}
          className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
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
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition disabled:opacity-40 ${
            user.active ? "bg-emerald-900 text-emerald-300" : "bg-slate-800 text-slate-500"
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
              className="w-28 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100"
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
            className="text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            Restablecer…
          </button>
        )}
      </td>
    </tr>
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
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4"
    >
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Nombre</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-40 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Email</label>
        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-52 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
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
          className="w-40 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-400">Rol</label>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value)}
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
        >
          <option value="AGENT">Agente</option>
          <option value="ADMIN">Administrador</option>
        </select>
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {submitting ? "Creando…" : "+ Nuevo usuario"}
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
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-1 text-sm font-semibold text-slate-100">Reasignación masiva</h2>
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
            className="w-52 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
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
            className="w-52 rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100"
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
          className="rounded-md bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
        >
          {busy ? "Reasignando…" : "Reasignar todos"}
        </button>
      </form>
    </section>
  );
}
