"use client";

import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, Label, Member, Role } from "@/lib/api";

export default function SettingsPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const qc = useQueryClient();

  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });
  const labels = useQuery({
    queryKey: ["labels", teamId],
    queryFn: () => api<Label[]>(`/teams/${teamId}/labels`),
  });

  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      api(`/teams/${teamId}/members/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", teamId] }),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/teams/${teamId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members", teamId] }),
  });

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Role>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const createInvite = useMutation({
    mutationFn: () =>
      api<{ token: string }>(`/teams/${teamId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      }),
    onSuccess: (data) => {
      const url = `${window.location.origin}/invite/${data.token}`;
      setInviteLink(url);
      setInviteEmail("");
    },
  });

  const [labelName, setLabelName] = useState("");
  const [labelColor, setLabelColor] = useState("#888888");
  const createLabel = useMutation({
    mutationFn: () =>
      api<Label>(`/teams/${teamId}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: labelName, color: labelColor }),
      }),
    onSuccess: () => {
      setLabelName("");
      qc.invalidateQueries({ queryKey: ["labels", teamId] });
    },
  });
  const deleteLabel = useMutation({
    mutationFn: (id: string) => api(`/labels/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["labels", teamId] }),
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-10">
      <section>
        <h2 className="text-xl font-semibold">Members</h2>
        <ul className="mt-4 divide-y rounded border bg-white">
          {(members.data ?? []).map((m) => (
            <li key={m.user.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{m.user.display_name}</div>
                <div className="text-xs text-neutral-500">{m.user.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={m.role}
                  onChange={(e) =>
                    changeRole.mutate({ userId: m.user.id, role: e.target.value as Role })
                  }
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="owner">owner</option>
                  <option value="editor">editor</option>
                  <option value="member">member</option>
                  <option value="viewer">viewer</option>
                </select>
                <button
                  onClick={() => removeMember.mutate(m.user.id)}
                  className="text-xs text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Invite a user</h2>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (inviteEmail.trim()) createInvite.mutate();
          }}
        >
          <input
            type="email"
            placeholder="email"
            className="flex-1 rounded border border-neutral-300 px-3 py-2"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value as Role)}
            className="rounded border border-neutral-300 px-2 py-2"
          >
            <option value="owner">owner</option>
            <option value="editor">editor</option>
            <option value="member">member</option>
            <option value="viewer">viewer</option>
          </select>
          <button className="rounded bg-neutral-900 px-4 py-2 text-white">
            Create invite
          </button>
        </form>
        {inviteLink && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm">
            Copy this invite link (shown once):{" "}
            <code className="break-all">{inviteLink}</code>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Labels</h2>
        <ul className="mt-4 flex flex-wrap gap-2">
          {(labels.data ?? []).map((l) => (
            <li
              key={l.id}
              className="flex items-center gap-2 rounded border px-2 py-1 text-sm"
              style={{ borderColor: l.color }}
            >
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: l.color }}
              />
              {l.name}
              <button
                onClick={() => deleteLabel.mutate(l.id)}
                className="text-neutral-400 hover:text-red-600"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (labelName.trim()) createLabel.mutate();
          }}
        >
          <input
            className="rounded border border-neutral-300 px-3 py-2"
            placeholder="Label name"
            value={labelName}
            onChange={(e) => setLabelName(e.target.value)}
          />
          <input
            type="color"
            value={labelColor}
            onChange={(e) => setLabelColor(e.target.value)}
            className="h-10 w-14 rounded border"
          />
          <button className="rounded bg-neutral-900 px-4 py-2 text-white">Add</button>
        </form>
      </section>
    </main>
  );
}
