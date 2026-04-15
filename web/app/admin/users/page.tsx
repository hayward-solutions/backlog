"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, User } from "@/lib/api";

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<User[]>("/admin/users"),
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const createUser = useMutation({
    mutationFn: () =>
      api<User>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          display_name: displayName,
          is_system_admin: isAdmin,
        }),
      }),
    onSuccess: () => {
      setEmail("");
      setPassword("");
      setDisplayName("");
      setIsAdmin(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const patchUser = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      api<User>(`/admin/users/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
    onError: (e: Error) => alert(e.message),
  });

  const resetPassword = (id: string, label: string) => {
    const pw = prompt(`New password for ${label} (min 8 chars):`);
    if (!pw) return;
    if (pw.length < 8) {
      alert("Password must be at least 8 characters.");
      return;
    }
    patchUser.mutate({ id, patch: { password: pw } });
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-neutral-500">
          Server-wide user administration.
        </p>
      </div>

      <section>
        <div className="mt-4 overflow-hidden rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
              <tr>
                <th className="px-3 py-2">Display name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(users.data ?? []).map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <input
                      defaultValue={u.display_name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== u.display_name)
                          patchUser.mutate({ id: u.id, patch: { display_name: v } });
                      }}
                      className="w-full rounded border border-neutral-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="email"
                      defaultValue={u.email}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toLowerCase();
                        if (v && v !== u.email)
                          patchUser.mutate({ id: u.id, patch: { email: v } });
                      }}
                      className="w-full rounded border border-neutral-200 px-2 py-1"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={u.is_system_admin}
                      onChange={(e) =>
                        patchUser.mutate({
                          id: u.id,
                          patch: { is_system_admin: e.target.checked },
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {u.disabled_at ? (
                      <span className="rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                        disabled
                      </span>
                    ) : (
                      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                        active
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="mr-3 text-xs text-neutral-600 hover:underline"
                      onClick={() => resetPassword(u.id, u.display_name || u.email)}
                    >
                      Reset password
                    </button>
                    <button
                      className={`text-xs hover:underline ${
                        u.disabled_at ? "text-emerald-700" : "text-red-600"
                      }`}
                      onClick={() =>
                        patchUser.mutate({
                          id: u.id,
                          patch: { disabled: !u.disabled_at },
                        })
                      }
                    >
                      {u.disabled_at ? "Enable" : "Disable"}
                    </button>
                  </td>
                </tr>
              ))}
              {(users.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-neutral-500">
                    No users.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createUser.mutate();
          }}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <input
            placeholder="display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="flex-1 min-w-[140px] rounded border px-3 py-2"
          />
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 min-w-[180px] rounded border px-3 py-2"
          />
          <input
            type="password"
            placeholder="password (8+ chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="flex-1 min-w-[160px] rounded border px-3 py-2"
          />
          <label className="flex items-center gap-1 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
            />
            server admin
          </label>
          <button className="rounded bg-neutral-900 px-4 py-2 text-white">
            Create user
          </button>
        </form>
      </section>
    </main>
  );
}
