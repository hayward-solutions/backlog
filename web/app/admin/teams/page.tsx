"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { api, Team, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { IconPlus, IconSearch } from "@/components/ui/icons";

export default function AdminTeamsPage() {
  const qc = useQueryClient();
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<User[]>("/admin/users"),
  });

  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = teams.data ?? [];
    if (!q) return list;
    return list.filter(
      (t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q)
    );
  }, [teams.data, search]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const createTeam = useMutation({
    mutationFn: () =>
      api<Team>("/admin/teams", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          owner_id: ownerId || undefined,
        }),
      }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setOwnerId("");
      setErr(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <AppShell
      topSlot={<Breadcrumbs items={[{ label: "Admin" }, { label: "Teams" }]} />}
    >
      <div className="border-b border-ink-200 bg-ink-0 px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">Teams</h1>
            <p className="text-sm text-ink-600">
              All teams on this server. Click a team to manage its members and settings.
            </p>
          </div>
          <Button variant="primary" onClick={() => setOpen(true)}>
            <IconPlus size={14} /> New team
          </Button>
        </div>
      </div>

      <div className="border-b border-ink-200 bg-ink-0 px-4 py-3 sm:px-6">
        <div className="relative max-w-sm">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or slug…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-ink-0">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-ink-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
            <tr>
              <th className="border-b border-ink-200 px-3 py-2">Team</th>
              <th className="border-b border-ink-200 px-3 py-2">Slug</th>
              <th className="border-b border-ink-200 px-3 py-2">Created</th>
              <th className="border-b border-ink-200 px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.id} className="border-t hover:bg-brand-50/40">
                <td className="border-b border-ink-100 px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={t.name} seed={t.id} size={28} />
                    <span className="font-medium text-ink-900">{t.name}</span>
                  </div>
                </td>
                <td className="border-b border-ink-100 px-3 py-2 font-mono text-[11.5px] text-ink-600">
                  {t.slug}
                </td>
                <td className="border-b border-ink-100 px-3 py-2 text-ink-500">
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-right">
                  <Link href={`/teams/${t.id}`}>
                    <Button size="sm" variant="ghost">
                      Open
                    </Button>
                  </Link>
                  <Link href={`/teams/${t.id}/settings`}>
                    <Button size="sm" variant="ghost" className="ml-1">
                      Settings
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-3 py-16 text-center text-sm text-ink-500"
                >
                  {search ? "No teams match your search." : "No teams."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <Modal
          title="Create team"
          onClose={() => {
            setOpen(false);
            setErr(null);
          }}
          width={480}
          footer={
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setErr(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!name.trim() || !slug.trim() || createTeam.isPending}
                onClick={() => createTeam.mutate()}
              >
                {createTeam.isPending ? "Creating…" : "Create team"}
              </Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field label="Name">
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Platform"
              />
            </Field>
            <Field label="Slug" hint="URL-safe short identifier. Lowercase, no spaces.">
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="platform"
              />
            </Field>
            <Field label="Owner" hint="Defaults to you if left blank.">
              <Select
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full"
              >
                <option value="">(me as owner)</option>
                {(users.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.display_name || u.email}
                  </option>
                ))}
              </Select>
            </Field>
            {err && (
              <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
                {err}
              </div>
            )}
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
