"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { api, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { IconPlus, IconSearch } from "@/components/ui/icons";

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<User[]>("/admin/users"),
  });

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = users.data ?? [];
    if (!q) return list;
    return list.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        u.display_name.toLowerCase().includes(q)
    );
  }, [users.data, search]);

  // Create user modal state
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [createErr, setCreateErr] = useState<string | null>(null);

  const createUser = useMutation({
    mutationFn: () =>
      api<User>("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          display_name: displayName.trim(),
          is_system_admin: isAdmin,
        }),
      }),
    onSuccess: () => {
      setEmail("");
      setPassword("");
      setDisplayName("");
      setIsAdmin(false);
      setCreateErr(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => setCreateErr(e.message),
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
    <AppShell
      topSlot={
        <Breadcrumbs items={[{ label: "Admin" }, { label: "Users" }]} />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">Users</h1>
            <p className="text-sm text-ink-600">Server-wide user administration.</p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <IconPlus size={14} /> New user
          </Button>
        </div>
      </div>

      <div className="border-b border-ink-200 bg-white px-4 py-3 sm:px-6">
        <div className="relative max-w-sm">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-ink-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
            <tr>
              <th className="border-b border-ink-200 px-3 py-2">User</th>
              <th className="border-b border-ink-200 px-3 py-2">Display name</th>
              <th className="border-b border-ink-200 px-3 py-2">Email</th>
              <th className="border-b border-ink-200 px-3 py-2">Admin</th>
              <th className="border-b border-ink-200 px-3 py-2">Status</th>
              <th className="border-b border-ink-200 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const label = u.display_name || u.email;
              return (
                <tr key={u.id} className="border-t hover:bg-brand-50/40">
                  <td className="border-b border-ink-100 px-3 py-2">
                    <Avatar name={label} seed={u.id} size={28} />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    <input
                      defaultValue={u.display_name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== u.display_name)
                          patchUser.mutate({ id: u.id, patch: { display_name: v } });
                      }}
                      className="control h-8 w-full"
                    />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    <input
                      type="email"
                      defaultValue={u.email}
                      onBlur={(e) => {
                        const v = e.target.value.trim().toLowerCase();
                        if (v && v !== u.email)
                          patchUser.mutate({ id: u.id, patch: { email: v } });
                      }}
                      className="control h-8 w-full"
                    />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={u.is_system_admin}
                      onChange={(e) =>
                        patchUser.mutate({
                          id: u.id,
                          patch: { is_system_admin: e.target.checked },
                        })
                      }
                      className="h-4 w-4 cursor-pointer accent-brand-600"
                    />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    {u.disabled_at ? (
                      <Badge tone="red">Disabled</Badge>
                    ) : (
                      <Badge tone="green">Active</Badge>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => resetPassword(u.id, label)}
                    >
                      Reset password
                    </Button>
                    <Button
                      size="sm"
                      variant={u.disabled_at ? "secondary" : "danger"}
                      className="ml-1"
                      onClick={() =>
                        patchUser.mutate({
                          id: u.id,
                          patch: { disabled: !u.disabled_at },
                        })
                      }
                    >
                      {u.disabled_at ? "Enable" : "Disable"}
                    </Button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-16 text-center text-sm text-ink-500"
                >
                  {search ? "No users match your search." : "No users."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title="Create user"
          onClose={() => {
            setOpen(false);
            setCreateErr(null);
          }}
          width={520}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setCreateErr(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!email.trim() || password.length < 8 || createUser.isPending}
                onClick={() => createUser.mutate()}
              >
                {createUser.isPending ? "Creating…" : "Create user"}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field label="Display name">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Jane Doe"
                autoFocus
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jane@company.com"
              />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-800">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-brand-600"
              />
              Server administrator
            </label>
            {createErr && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {createErr}
              </div>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
