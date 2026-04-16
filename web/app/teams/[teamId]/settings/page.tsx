"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { api, Label, Member, Role, Team, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, LabelPill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { IconCheck, IconPlus, IconSearch, IconTrash, IconUsers } from "@/components/ui/icons";

const ROLES: Role[] = ["owner", "editor", "member", "viewer"];

export default function TeamSettingsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const qc = useQueryClient();

  const team = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api<Team>(`/teams/${teamId}`),
  });
  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });
  const labels = useQuery({
    queryKey: ["labels", teamId],
    queryFn: () => api<Label[]>(`/teams/${teamId}/labels`),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>(`/auth/me`),
  });

  // Resolve the caller's role for this team — system admins get owner
  // implicitly, matching the backend's ResolveTeamRole behaviour.
  const myRole: Role | undefined = me.data?.is_system_admin
    ? "owner"
    : members.data?.find((m) => m.user.id === me.data?.id)?.role;
  const isOwner = myRole === "owner";

  const updateTeam = useMutation({
    mutationFn: (patch: { service_desk_enabled?: boolean }) =>
      api<Team>(`/teams/${teamId}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team", teamId] }),
    onError: (e: Error) => alert(e.message),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api(`/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", teamId] }),
    onError: (e: Error) => alert(e.message),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", teamId] }),
    onError: (e: Error) => alert(e.message),
  });

  // "Add existing user" flow — for people who already have an account on
  // this server, skip the invite-link dance and just attach them to the
  // team directly. The invite flow below still exists for people who don't
  // have an account yet. isOwner already accounts for system admins (they
  // get owner implicitly), so we gate on that alone.
  const [addSearch, setAddSearch] = useState("");
  const [addRole, setAddRole] = useState<Role>("member");
  const candidates = useQuery({
    queryKey: ["candidates", teamId, addSearch],
    queryFn: () =>
      api<User[]>(`/teams/${teamId}/candidates?q=${encodeURIComponent(addSearch)}`),
    enabled: isOwner,
  });

  const addMember = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api(`/teams/${teamId}/members`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, role }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", teamId] });
      qc.invalidateQueries({ queryKey: ["candidates", teamId] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createInvite = useMutation({
    mutationFn: () =>
      api<{ token: string }>(`/teams/${teamId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      }),
    onSuccess: (data) => {
      const url = `${window.location.origin}/invite/${data.token}`;
      setInviteLink(url);
      setInviteEmail("");
      setCopied(false);
    },
    onError: (e: Error) => alert(e.message),
  });

  const copyInvite = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#6E5DC6");
  const createLabel = useMutation({
    mutationFn: () =>
      api<Label>(`/teams/${teamId}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: labelName.trim(), color: labelColor }),
      }),
    onSuccess: () => {
      setLabelName("");
      qc.invalidateQueries({ queryKey: ["labels", teamId] });
    },
    onError: (e: Error) => alert(e.message),
  });
  const deleteLabel = useMutation({
    mutationFn: (id: string) => api(`/labels/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels", teamId] }),
    onError: (e: Error) => alert(e.message),
  });

  return (
    <AppShell
      teamId={teamId}
      topSlot={
        <Breadcrumbs
          items={[
            { label: "Teams", href: "/teams" },
            { label: team.data?.name ?? "Team", href: `/teams/${teamId}` },
            { label: "Members & settings" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
          Team settings
        </h1>
        <p className="text-sm text-ink-600">
          Manage members, invites, and shared labels for this team.
        </p>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Members */}
          <section className="surface overflow-hidden">
            <header className="flex items-center justify-between border-b border-ink-100 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Members</h2>
                <p className="text-xs text-ink-500">
                  {members.data?.length ?? 0} people on this team
                </p>
              </div>
              <IconUsers size={16} className="text-ink-400" />
            </header>
            <ul className="divide-y divide-ink-100">
              {(members.data ?? []).map((m) => {
                const displayName = m.user.display_name || m.user.email;
                return (
                  <li
                    key={m.user.id}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <Avatar name={displayName} seed={m.user.id} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink-900">
                          {displayName}
                        </span>
                        {m.user.is_system_admin && (
                          <Badge tone="purple" bold>
                            Admin
                          </Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-ink-500">
                        {m.user.email}
                      </div>
                    </div>
                    <Select
                      value={m.role}
                      onChange={(e) =>
                        changeRole.mutate({
                          userId: m.user.id,
                          role: e.target.value as Role,
                        })
                      }
                      className="w-32"
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
                        if (confirm(`Remove ${displayName} from this team?`))
                          removeMember.mutate(m.user.id);
                      }}
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                );
              })}
              {(members.data ?? []).length === 0 && (
                <li className="px-5 py-6 text-center text-sm text-ink-500">
                  No members yet.
                </li>
              )}
            </ul>
          </section>

          {/* Add existing user — direct add, no invite link. Only visible
              to people who can manage members (owners + system admins). */}
          {isOwner && (
            <section className="surface p-5">
              <h2 className="text-sm font-semibold text-ink-900">Add existing user</h2>
              <p className="mt-0.5 text-xs text-ink-500">
                Search people who already have an account on this server and
                add them directly — no invite link needed.
              </p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Field label="Search" className="min-w-[220px] flex-1">
                  <div className="relative">
                    <IconSearch
                      size={14}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
                    />
                    <Input
                      value={addSearch}
                      onChange={(e) => setAddSearch(e.target.value)}
                      placeholder="Search by name or email…"
                      className="pl-8"
                    />
                  </div>
                </Field>
                <Field label="Role">
                  <Select
                    value={addRole}
                    onChange={(e) => setAddRole(e.target.value as Role)}
                    className="w-32"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <ul className="mt-3 divide-y divide-ink-100 overflow-hidden rounded-md border border-ink-200">
                {(candidates.data ?? []).map((u) => {
                  const name = u.display_name || u.email;
                  return (
                    <li
                      key={u.id}
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <Avatar name={name} seed={u.id} size={28} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink-900">
                          {name}
                        </div>
                        <div className="truncate text-xs text-ink-500">
                          {u.email}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={addMember.isPending}
                        onClick={() =>
                          addMember.mutate({ userId: u.id, role: addRole })
                        }
                      >
                        <IconPlus size={12} /> Add as {addRole}
                      </Button>
                    </li>
                  );
                })}
                {candidates.isSuccess && (candidates.data ?? []).length === 0 && (
                  <li className="px-3 py-4 text-center text-sm text-ink-500">
                    {addSearch
                      ? "No matching users."
                      : "No users available — everyone's already on the team."}
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* Invite */}
          <section className="surface p-5">
            <h2 className="text-sm font-semibold text-ink-900">Invite someone</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Generates a one-time link for someone who doesn't have a server
              account yet.
            </p>
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (inviteEmail.trim() && !createInvite.isPending)
                  createInvite.mutate();
              }}
            >
              <Field label="Email" className="min-w-[220px] flex-1">
                <Input
                  type="email"
                  required
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </Field>
              <Field label="Role">
                <Select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as Role)}
                  className="w-32"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                type="submit"
                variant="primary"
                disabled={!inviteEmail.trim() || createInvite.isPending}
              >
                {createInvite.isPending ? "Creating…" : "Create invite"}
              </Button>
            </form>

            {inviteLink && (
              <div className="mt-4 rounded-md border border-warning-200 bg-warning-50 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-warning-700">
                  Invite link (copy now — shown once)
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 break-all rounded-xs bg-white px-2 py-1 font-mono text-xs text-ink-800">
                    {inviteLink}
                  </code>
                  <Button size="sm" onClick={copyInvite}>
                    {copied ? (
                      <>
                        <IconCheck size={12} /> Copied
                      </>
                    ) : (
                      "Copy"
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Labels */}
          <section className="surface p-5">
            <h2 className="text-sm font-semibold text-ink-900">Labels</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Shared across every board in this team.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(labels.data ?? []).map((l) => (
                <span key={l.id} className="relative inline-flex items-center">
                  <LabelPill name={l.name} color={l.color} />
                  <button
                    title="Delete label"
                    className="ml-1 rounded-xs p-0.5 text-ink-400 hover:bg-danger-50 hover:text-danger-600"
                    onClick={() => {
                      if (confirm(`Delete label "${l.name}"? This removes it from every task.`))
                        deleteLabel.mutate(l.id);
                    }}
                  >
                    <IconTrash size={12} />
                  </button>
                </span>
              ))}
              {(labels.data ?? []).length === 0 && (
                <span className="text-xs italic text-ink-500">
                  No labels yet — create one below.
                </span>
              )}
            </div>
            <form
              className="mt-4 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (labelName.trim() && !createLabel.isPending) createLabel.mutate();
              }}
            >
              <Field label="Name" className="flex-1">
                <Input
                  value={labelName}
                  onChange={(e) => setLabelName(e.target.value)}
                  placeholder="e.g. bug"
                />
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  value={labelColor}
                  onChange={(e) => setLabelColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded-md border border-ink-200"
                />
              </Field>
              <Button
                type="submit"
                variant="primary"
                disabled={!labelName.trim() || createLabel.isPending}
              >
                <IconPlus size={14} /> Add label
              </Button>
            </form>
          </section>

          {/* Service desk */}
          <section className="surface p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-ink-900">
                  Service desk
                </h2>
                <p className="mt-0.5 text-xs text-ink-500">
                  Turn this on to let owners create service-desk boards with
                  customer-facing intake forms. Disabling hides existing desk
                  boards and stops public forms from accepting new submissions
                  — the data is preserved and reappears when re-enabled.
                </p>
              </div>
              <label className="flex shrink-0 items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 cursor-pointer rounded border-ink-300 text-accent-600 focus:ring-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
                  checked={!!team.data?.service_desk_enabled}
                  disabled={!isOwner || updateTeam.isPending}
                  onChange={(e) =>
                    updateTeam.mutate({ service_desk_enabled: e.target.checked })
                  }
                />
                <span>
                  {team.data?.service_desk_enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>
            {!isOwner && (
              <p className="mt-3 text-xs italic text-ink-500">
                Only team owners can change this setting.
              </p>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
