"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { api, Board, Member, Team } from "@/lib/api";
import { Avatar, AvatarGroup } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { IconBoard, IconPlus, IconSettings } from "@/components/ui/icons";

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const qc = useQueryClient();

  const team = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api<Team>(`/teams/${teamId}`),
  });
  const boards = useQuery({
    queryKey: ["boards", teamId],
    queryFn: () => api<Board[]>(`/teams/${teamId}/boards`),
  });
  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api<Board>(`/teams/${teamId}/boards`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      }),
    onSuccess: () => {
      setName("");
      setDescription("");
      setErr(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["boards", teamId] });
    },
    onError: (e: Error) => setErr(e.message),
  });

  const memberNames = (members.data ?? []).map(
    (m) => m.user.display_name || m.user.email
  );

  return (
    <AppShell
      teamId={teamId}
      topSlot={
        <Breadcrumbs
          items={[
            { label: "Teams", href: "/teams" },
            { label: team.data?.name ?? "Team" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {team.data && (
              <Avatar name={team.data.name} seed={team.data.id} size={40} />
            )}
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-semibold tracking-tight text-ink-900">
                {team.data?.name ?? "…"}
              </h1>
              <p className="truncate font-mono text-[11.5px] uppercase tracking-wide text-ink-500">
                {team.data?.slug}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {memberNames.length > 0 && (
              <div className="hidden items-center gap-2 sm:flex">
                <AvatarGroup names={memberNames} size={26} max={5} />
                <span className="text-xs text-ink-600">
                  {memberNames.length} member{memberNames.length === 1 ? "" : "s"}
                </span>
              </div>
            )}
            <Link href={`/teams/${teamId}/settings`}>
              <Button variant="secondary" size="sm">
                <IconSettings size={14} /> Settings
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            Boards
          </h2>
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <IconPlus size={14} /> New board
          </Button>
        </div>

        {boards.isLoading && <p className="text-sm text-ink-500">Loading boards…</p>}

        {boards.data && boards.data.length === 0 && (
          <EmptyState
            icon={<IconBoard size={18} />}
            title="No boards yet"
            description="Create your first board to start tracking tasks."
            action={
              <Button variant="primary" onClick={() => setOpen(true)}>
                <IconPlus size={14} /> Create board
              </Button>
            }
          />
        )}

        {boards.data && boards.data.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {boards.data.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/boards/${b.id}`}
                  className="card-hover flex h-full flex-col rounded-lg border border-ink-200 bg-white p-4"
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                      <IconBoard size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-ink-900">
                        {b.name}
                      </div>
                      {b.description ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
                          {b.description}
                        </p>
                      ) : (
                        <p className="mt-0.5 text-xs italic text-ink-400">
                          No description
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                    <span>Created {new Date(b.created_at).toLocaleDateString()}</span>
                    <span className="font-medium text-brand-600">Open →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <Modal
          title="Create board"
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
                disabled={!name.trim() || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Creating…" : "Create board"}
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
                placeholder="e.g. Platform Q2"
              />
            </Field>
            <Field label="Description" hint="Optional — shown on the team page.">
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this board for?"
              />
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
