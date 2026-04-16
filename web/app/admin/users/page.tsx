"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { api, Role, Team, User, UserMembership } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Drawer, Modal } from "@/components/ui/Modal";
import { IconPlus, IconSearch, IconTrash, IconUsers } from "@/components/ui/icons";

const ROLES: Role[] = ["owner", "editor", "member", "viewer"];

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

  // Password reset modal state — replaces prompt() which displays the
  // password in plaintext and stores it in browser history.
  const [resetTarget, setResetTarget] = useState<{ id: string; label: string } | null>(null);
  const [resetPw, setResetPw] = useState("");
  const [resetErr, setResetErr] = useState<string | null>(null);
  const MIN_PW_LEN = 12;
  const pwPolicyOk =
    resetPw.length >= MIN_PW_LEN &&
    /[A-Z]/.test(resetPw) &&
    /[a-z]/.test(resetPw) &&
    /[0-9]/.test(resetPw) &&
    /[^A-Za-z0-9]/.test(resetPw);

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

  const openResetPassword = (id: string, label: string) => {
    setResetTarget({ id, label });
    setResetPw("");
    setResetErr(null);
  };

  // Hard-delete flow. We route FK-violation errors (409) back to the admin
  // with a clear "disable instead" message rather than a cryptic HTTP code.
  const deleteUser = useMutation({
    mutationFn: (id: string) => api(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const handleDelete = (u: User) => {
    const label = u.display_name || u.email;
    if (
      !confirm(
        `Delete ${label}? This cannot be undone. If they have created tasks or comments, the server will block the delete — use Disable in that case.`,
      )
    )
      return;
    deleteUser.mutate(u.id, {
      onError: (e: Error) => alert(e.message),
    });
  };

  // "Manage teams" drawer state — lets admins add/remove/change-role on a
  // user's team memberships without navigating to each team's settings page.
  const [teamsTarget, setTeamsTarget] = useState<User | null>(null);

  const submitResetPassword = () => {
    if (!resetTarget || !pwPolicyOk) return;
    patchUser.mutate(
      { id: resetTarget.id, patch: { password: resetPw } },
      {
        onSuccess: () => {
          setResetTarget(null);
          setResetPw("");
          setResetErr(null);
        },
        onError: (e: Error) => setResetErr(e.message),
      },
    );
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
                      onClick={() => setTeamsTarget(u)}
                      title="Manage team assignments"
                    >
                      <IconUsers size={12} /> Teams
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-1"
                      onClick={() => openResetPassword(u.id, label)}
                    >
                      Reset password
                    </Button>
                    <Button
                      size="sm"
                      variant={u.disabled_at ? "secondary" : "ghost"}
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
                    <Button
                      size="sm"
                      variant="danger"
                      className="ml-1"
                      onClick={() => handleDelete(u)}
                      title="Delete user permanently"
                    >
                      <IconTrash size={12} />
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
                disabled={
                  !email.trim() ||
                  !(
                    password.length >= MIN_PW_LEN &&
                    /[A-Z]/.test(password) &&
                    /[a-z]/.test(password) &&
                    /[0-9]/.test(password) &&
                    /[^A-Za-z0-9]/.test(password)
                  ) ||
                  createUser.isPending
                }
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
            <Field
              label="Password"
              hint="At least 12 characters with upper, lower, digit, and symbol."
            >
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

      {teamsTarget && (
        <ManageTeamsDrawer user={teamsTarget} onClose={() => setTeamsTarget(null)} />
      )}

      {resetTarget && (
        <Modal
          title={`Reset password for ${resetTarget.label}`}
          onClose={() => {
            setResetTarget(null);
            setResetPw("");
            setResetErr(null);
          }}
          width={480}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setResetTarget(null);
                  setResetPw("");
                  setResetErr(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!pwPolicyOk || patchUser.isPending}
                onClick={submitResetPassword}
              >
                {patchUser.isPending ? "Saving…" : "Set password"}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field
              label="New password"
              hint="At least 12 characters with upper, lower, digit, and symbol."
            >
              <Input
                type="password"
                required
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                placeholder="••••••••"
                autoFocus
              />
            </Field>
            {resetErr && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {resetErr}
              </div>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

/** Drawer for administering a user's team memberships. Lists current teams
 * with a role selector + remove action, and lets the admin add the user to
 * any other team on the server. We load both the user's memberships and the
 * full team list so the admin can pick any team without leaving the drawer. */
function ManageTeamsDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  const qc = useQueryClient();
  const memberships = useQuery({
    queryKey: ["admin-user-memberships", user.id],
    queryFn: () => api<UserMembership[]>(`/admin/users/${user.id}/memberships`),
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });

  const addMember = useMutation({
    mutationFn: ({ teamId, role }: { teamId: string; role: Role }) =>
      api(`/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: user.id, role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-memberships", user.id] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ teamId, role }: { teamId: string; role: Role }) =>
      api(`/teams/${teamId}/members/${user.id}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-memberships", user.id] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const removeMember = useMutation({
    mutationFn: (teamId: string) =>
      api(`/teams/${teamId}/members/${user.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-user-memberships", user.id] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const [addTeamId, setAddTeamId] = useState("");
  const [addRole, setAddRole] = useState<Role>("member");

  const currentTeamIds = new Set((memberships.data ?? []).map((m) => m.team_id));
  const availableTeams = (teams.data ?? []).filter((t) => !currentTeamIds.has(t.id));

  const displayName = user.display_name || user.email;

  return (
    <Drawer
      title="Manage team assignments"
      subtitle={displayName}
      onClose={onClose}
      width={480}
    >
      <div className="space-y-5 p-5">
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Current teams ({memberships.data?.length ?? 0})
          </h3>
          <ul className="mt-2 divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-200">
            {(memberships.data ?? []).map((m) => (
              <li key={m.team_id} className="flex items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">
                    {m.team_name}
                  </div>
                  <div className="truncate font-mono text-[11px] text-ink-500">
                    {m.team_slug}
                  </div>
                </div>
                <Select
                  value={m.role}
                  onChange={(e) =>
                    changeRole.mutate({ teamId: m.team_id, role: e.target.value as Role })
                  }
                  className="w-28"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
                <button
                  className="rounded-xs p-1 text-ink-500 hover:bg-danger-50 hover:text-danger-600"
                  title="Remove from team"
                  onClick={() => {
                    if (confirm(`Remove ${displayName} from ${m.team_name}?`))
                      removeMember.mutate(m.team_id);
                  }}
                >
                  <IconTrash size={14} />
                </button>
              </li>
            ))}
            {(memberships.data ?? []).length === 0 && (
              <li className="px-3 py-4 text-center text-sm text-ink-500">
                Not a member of any team.
              </li>
            )}
          </ul>
        </section>

        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            Add to team
          </h3>
          <div className="mt-2 flex items-end gap-2">
            <Field label="Team" className="flex-1">
              <Select
                value={addTeamId}
                onChange={(e) => setAddTeamId(e.target.value)}
              >
                <option value="">Select a team…</option>
                {availableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Role">
              <Select
                value={addRole}
                onChange={(e) => setAddRole(e.target.value as Role)}
                className="w-28"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              variant="primary"
              disabled={!addTeamId || addMember.isPending}
              onClick={() => {
                addMember.mutate(
                  { teamId: addTeamId, role: addRole },
                  {
                    onSuccess: () => {
                      setAddTeamId("");
                      setAddRole("member");
                    },
                  },
                );
              }}
            >
              <IconPlus size={14} /> Add
            </Button>
          </div>
          {availableTeams.length === 0 && (teams.data?.length ?? 0) > 0 && (
            <p className="mt-2 text-xs italic text-ink-500">
              Already a member of every team.
            </p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
