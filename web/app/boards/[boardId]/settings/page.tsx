"use client";

import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { LabelPill, StatusPill } from "@/components/ui/Badge";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";
import {
  api,
  BoardTree,
  Column as ColumnT,
  ColumnType,
  Label,
  canManageBoards,
} from "@/lib/api";

export default function BoardSettingsPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const qc = useQueryClient();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api<BoardTree>(`/boards/${boardId}`),
  });

  const createColumn = useMutation({
    mutationFn: ({
      name,
      type,
      position,
    }: {
      name: string;
      type: ColumnType;
      position: number;
    }) =>
      api<ColumnT>(`/boards/${boardId}/columns`, {
        method: "POST",
        body: JSON.stringify({ name, type, position }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const updateColumn = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        type?: ColumnType;
        position?: number;
        wip_limit?: number | null;
      };
    }) =>
      api<ColumnT>(`/columns/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const deleteColumn = useMutation({
    mutationFn: (id: string) => api(`/columns/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const updateBoard = useMutation({
    mutationFn: (patch: { name: string; description: string; archived: boolean }) =>
      api(`/boards/${boardId}`, { method: "PATCH", body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });

  const deleteBoard = useMutation({
    mutationFn: () => api(`/boards/${boardId}`, { method: "DELETE" }),
    onSuccess: () => {
      const teamId = query.data?.board.team_id;
      router.push(teamId ? `/teams/${teamId}` : "/teams");
    },
    onError: (e: Error) => alert(e.message),
  });

  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<ColumnType>("todo");
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6E5DC6");

  const teamId = query.data?.board.team_id;

  const createLabel = useMutation({
    mutationFn: () =>
      api<Label>(`/teams/${teamId}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
      }),
    onSuccess: () => {
      setNewLabelName("");
      setNewLabelColor("#6E5DC6");
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      if (teamId) qc.invalidateQueries({ queryKey: ["labels", teamId] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const updateLabel = useMutation({
    mutationFn: ({ id, name, color }: { id: string; name: string; color: string }) =>
      api<Label>(`/labels/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, color }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      if (teamId) qc.invalidateQueries({ queryKey: ["labels", teamId] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const deleteLabel = useMutation({
    mutationFn: (id: string) => api(`/labels/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", boardId] });
      if (teamId) qc.invalidateQueries({ queryKey: ["labels", teamId] });
    },
    onError: (e: Error) => alert(e.message),
  });

  if (query.isLoading) {
    return (
      <AppShell boardId={boardId}>
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
          Loading…
        </div>
      </AppShell>
    );
  }
  if (query.error) {
    return (
      <AppShell boardId={boardId}>
        <div className="p-6 text-sm text-danger-600">
          {(query.error as Error).message}
        </div>
      </AppShell>
    );
  }
  const tree = query.data!;
  const canManage = canManageBoards(tree.your_role);
  const canDelete = tree.your_role === "owner";
  const columns = [...tree.columns].sort((a, b) => a.position - b.position);
  const taskCount = (colId: string) =>
    tree.tasks.filter((t) => t.column_id === colId).length;

  if (!canManage) {
    return (
      <AppShell boardId={boardId} teamId={tree.board.team_id}>
        <div className="p-6 text-sm text-danger-600">
          You don&apos;t have permission to manage this board.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      boardId={boardId}
      teamId={tree.board.team_id}
      topSlot={
        <Breadcrumbs
          items={[
            { label: "Teams", href: "/teams" },
            { label: "Team", href: `/teams/${tree.board.team_id}` },
            { label: tree.board.name, href: `/boards/${boardId}` },
            { label: "Settings" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
          Board settings
        </h1>
        <p className="text-sm text-ink-600">
          Manage details, columns, labels, and destructive actions.
        </p>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 sm:px-6">
          {/* Details */}
          <section className="surface p-5">
            <SectionHeader
              title="Details"
              description="The board's display name and description."
            />
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const fd = new FormData(form);
                updateBoard.mutate({
                  name: String(fd.get("name") ?? ""),
                  description: String(fd.get("description") ?? ""),
                  archived: !!tree.board.archived_at,
                });
              }}
            >
              <Field label="Name">
                <Input name="name" defaultValue={tree.board.name} />
              </Field>
              <Field label="Description">
                <Textarea
                  name="description"
                  defaultValue={tree.board.description}
                  rows={3}
                />
              </Field>
              <Button variant="primary" type="submit">
                Save
              </Button>
            </form>
          </section>

          {/* Columns */}
          <section className="surface p-5">
            <SectionHeader
              title="Columns"
              description={
                <>
                  Column <strong>type</strong> controls completion — tasks entering a{" "}
                  <StatusPill type="done" /> column are auto-marked complete.
                </>
              }
            />
            <ul className="mt-4 divide-y divide-ink-100 rounded-md border border-ink-200">
              {columns.map((c, idx) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                  <div className="flex flex-col">
                    <button
                      disabled={idx === 0}
                      onClick={() => {
                        const prev = columns[idx - 1];
                        const prevPrev = columns[idx - 2];
                        const newPos = prevPrev
                          ? (prevPrev.position + prev.position) / 2
                          : prev.position - 1;
                        updateColumn.mutate({ id: c.id, patch: { position: newPos } });
                      }}
                      className="text-ink-500 hover:text-ink-800 disabled:opacity-30"
                      title="Move up"
                    >
                      <IconArrowUp size={12} strokeWidth={2.5} />
                    </button>
                    <button
                      disabled={idx === columns.length - 1}
                      onClick={() => {
                        const next = columns[idx + 1];
                        const nextNext = columns[idx + 2];
                        const newPos = nextNext
                          ? (next.position + nextNext.position) / 2
                          : next.position + 1;
                        updateColumn.mutate({ id: c.id, patch: { position: newPos } });
                      }}
                      className="text-ink-500 hover:text-ink-800 disabled:opacity-30"
                      title="Move down"
                    >
                      <IconArrowDown size={12} strokeWidth={2.5} />
                    </button>
                  </div>
                  <Input
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== c.name)
                        updateColumn.mutate({ id: c.id, patch: { name: v } });
                    }}
                    className="min-w-[140px] flex-1"
                  />
                  <Select
                    value={c.type}
                    onChange={(e) =>
                      updateColumn.mutate({
                        id: c.id,
                        patch: { type: e.target.value as ColumnType },
                      })
                    }
                    className="w-36"
                  >
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                  </Select>
                  <Input
                    type="number"
                    min={0}
                    defaultValue={c.wip_limit ?? ""}
                    placeholder="WIP"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const n = v === "" ? null : Number(v);
                      if (n !== (c.wip_limit ?? null)) {
                        updateColumn.mutate({ id: c.id, patch: { wip_limit: n } });
                      }
                    }}
                    className="w-20"
                    title="WIP limit"
                  />
                  <span className="whitespace-nowrap text-xs text-ink-500">
                    {taskCount(c.id)} task{taskCount(c.id) === 1 ? "" : "s"}
                  </span>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      if (taskCount(c.id) > 0) {
                        alert("Move tasks out of this column first.");
                        return;
                      }
                      if (confirm(`Delete column "${c.name}"?`)) deleteColumn.mutate(c.id);
                    }}
                  >
                    <IconTrash size={12} /> Delete
                  </Button>
                </li>
              ))}
            </ul>

            <form
              className="mt-4 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                const last = columns[columns.length - 1]?.position ?? 0;
                createColumn.mutate({
                  name: newName.trim(),
                  type: newType,
                  position: last + 1,
                });
                setNewName("");
                setNewType("todo");
              }}
            >
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="New column name"
                className="min-w-[200px] flex-1"
              />
              <Select
                value={newType}
                onChange={(e) => setNewType(e.target.value as ColumnType)}
                className="w-36"
              >
                <option value="todo">To do</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </Select>
              <Button variant="primary" type="submit">
                <IconPlus size={14} strokeWidth={2.25} />
                Add column
              </Button>
            </form>
          </section>

          {/* Labels */}
          <section className="surface p-5">
            <SectionHeader
              title="Labels"
              description="Labels are shared across all boards in this team."
            />
            <ul className="mt-4 divide-y divide-ink-100 rounded-md border border-ink-200">
              {tree.labels.length === 0 && (
                <li className="px-4 py-3 text-sm text-ink-500">No labels yet.</li>
              )}
              {tree.labels.map((l) => {
                const usage = tree.tasks.filter((t) => t.label_ids.includes(l.id)).length;
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                    <input
                      type="color"
                      defaultValue={l.color}
                      onBlur={(e) => {
                        const v = e.target.value;
                        if (v !== l.color)
                          updateLabel.mutate({ id: l.id, name: l.name, color: v });
                      }}
                      className="h-8 w-8 shrink-0 cursor-pointer rounded-md border border-ink-200"
                      title="Color"
                    />
                    <Input
                      defaultValue={l.name}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== l.name)
                          updateLabel.mutate({ id: l.id, name: v, color: l.color });
                      }}
                      className="min-w-[160px] flex-1"
                    />
                    <LabelPill name={l.name} color={l.color} />
                    <span className="whitespace-nowrap text-xs text-ink-500">
                      {usage} task{usage === 1 ? "" : "s"}
                    </span>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        if (
                          confirm(
                            `Delete label "${l.name}"? It will be removed from ${usage} task(s).`
                          )
                        )
                          deleteLabel.mutate(l.id);
                      }}
                    >
                      <IconTrash size={12} /> Delete
                    </Button>
                  </li>
                );
              })}
            </ul>
            <form
              className="mt-4 flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newLabelName.trim() && !createLabel.isPending) createLabel.mutate();
              }}
            >
              <input
                type="color"
                value={newLabelColor}
                onChange={(e) => setNewLabelColor(e.target.value)}
                className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-ink-200"
              />
              <Input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="New label name"
                className="min-w-[200px] flex-1"
              />
              <Button
                type="submit"
                variant="primary"
                disabled={!newLabelName.trim() || createLabel.isPending}
              >
                <IconPlus size={14} strokeWidth={2.25} />
                Add label
              </Button>
            </form>
          </section>

          {canDelete && (
            <section className="surface border-danger-100 p-5">
              <SectionHeader
                title="Danger zone"
                description="Irreversible actions. Proceed with caution."
                tone="danger"
              />
              <div className="mt-4">
                <Button
                  variant="danger"
                  onClick={() => {
                    if (
                      confirm(`Delete board "${tree.board.name}" and all its tasks?`)
                    ) {
                      deleteBoard.mutate();
                    }
                  }}
                >
                  <IconTrash size={14} /> Delete board
                </Button>
              </div>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function SectionHeader({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description?: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <div>
      <h2
        className={`text-base font-semibold ${
          tone === "danger" ? "text-danger-700" : "text-ink-900"
        }`}
      >
        {title}
      </h2>
      {description && <p className="mt-0.5 text-sm text-ink-600">{description}</p>}
    </div>
  );
}
