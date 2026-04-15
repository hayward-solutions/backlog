"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Nav } from "@/components/Nav";
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
  const [newLabelColor, setNewLabelColor] = useState("#888888");

  const teamId = query.data?.board.team_id;

  const createLabel = useMutation({
    mutationFn: () =>
      api<Label>(`/teams/${teamId}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
      }),
    onSuccess: () => {
      setNewLabelName("");
      setNewLabelColor("#888888");
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
      <div>
        <Nav />
        <p className="p-6 text-neutral-500">Loading…</p>
      </div>
    );
  }
  if (query.error) {
    return (
      <div>
        <Nav />
        <p className="p-6 text-red-600">{(query.error as Error).message}</p>
      </div>
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
      <div>
        <Nav />
        <p className="p-6 text-red-600">You don&apos;t have permission to manage this board.</p>
      </div>
    );
  }

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-8 space-y-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{tree.board.name}</h1>
            <p className="text-sm text-neutral-500">Board settings</p>
          </div>
          <Link
            href={`/boards/${boardId}`}
            className="text-sm text-neutral-500 hover:underline"
          >
            ← back to board
          </Link>
        </div>

        <section>
          <h2 className="text-lg font-semibold">Details</h2>
          <form
            className="mt-3 space-y-3"
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
            <label className="block text-sm">
              <span className="text-neutral-600">Name</span>
              <input
                name="name"
                defaultValue={tree.board.name}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Description</span>
              <textarea
                name="description"
                defaultValue={tree.board.description}
                rows={3}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              Save
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Columns</h2>
          <p className="text-sm text-neutral-500">
            Type controls completion — tasks entering a <code>done</code> column
            are auto-marked complete.
          </p>
          <ul className="mt-4 divide-y rounded border bg-white">
            {columns.map((c, idx) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex flex-col gap-1">
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
                    className="text-xs text-neutral-500 disabled:opacity-30"
                    title="Move up"
                  >
                    ▲
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
                    className="text-xs text-neutral-500 disabled:opacity-30"
                    title="Move down"
                  >
                    ▼
                  </button>
                </div>
                <input
                  defaultValue={c.name}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v && v !== c.name) updateColumn.mutate({ id: c.id, patch: { name: v } });
                  }}
                  className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                />
                <select
                  value={c.type}
                  onChange={(e) =>
                    updateColumn.mutate({
                      id: c.id,
                      patch: { type: e.target.value as ColumnType },
                    })
                  }
                  className="rounded border border-neutral-300 px-2 py-1 text-sm"
                >
                  <option value="todo">todo</option>
                  <option value="in_progress">in_progress</option>
                  <option value="done">done</option>
                </select>
                <input
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
                  className="w-16 rounded border border-neutral-300 px-2 py-1 text-sm"
                  title="WIP limit (informational in v1)"
                />
                <span className="w-20 text-right text-xs text-neutral-500">
                  {taskCount(c.id)} task{taskCount(c.id) === 1 ? "" : "s"}
                </span>
                <button
                  onClick={() => {
                    if (taskCount(c.id) > 0) {
                      alert("Move tasks out of this column first.");
                      return;
                    }
                    if (confirm(`Delete column "${c.name}"?`)) deleteColumn.mutate(c.id);
                  }}
                  className="text-xs text-red-600 hover:underline"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              const last = columns[columns.length - 1]?.position ?? 0;
              createColumn.mutate({ name: newName.trim(), type: newType, position: last + 1 });
              setNewName("");
              setNewType("todo");
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New column name"
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as ColumnType)}
              className="rounded border border-neutral-300 px-2 py-2 text-sm"
            >
              <option value="todo">todo</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
            </select>
            <button className="rounded bg-neutral-900 px-4 py-2 text-sm text-white">
              Add column
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Labels</h2>
          <p className="text-sm text-neutral-500">
            Labels are shared across all boards in this team.
          </p>
          <ul className="mt-4 divide-y rounded border bg-white">
            {tree.labels.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500">No labels yet.</li>
            )}
            {tree.labels.map((l) => {
              const usage = tree.tasks.filter((t) => t.label_ids.includes(l.id)).length;
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="color"
                    defaultValue={l.color}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v !== l.color)
                        updateLabel.mutate({ id: l.id, name: l.name, color: v });
                    }}
                    className="h-8 w-8 cursor-pointer rounded border border-neutral-300"
                    title="Color"
                  />
                  <input
                    defaultValue={l.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== l.name)
                        updateLabel.mutate({ id: l.id, name: v, color: l.color });
                    }}
                    className="flex-1 rounded border border-neutral-300 px-2 py-1 text-sm"
                  />
                  <span
                    className="rounded px-2 py-0.5 text-xs text-white"
                    style={{ background: l.color }}
                  >
                    {l.name}
                  </span>
                  <span className="w-24 text-right text-xs text-neutral-500">
                    {usage} task{usage === 1 ? "" : "s"}
                  </span>
                  <button
                    onClick={() => {
                      if (confirm(`Delete label "${l.name}"? It will be removed from ${usage} task(s).`))
                        deleteLabel.mutate(l.id);
                    }}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </li>
              );
            })}
          </ul>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (newLabelName.trim() && !createLabel.isPending) createLabel.mutate();
            }}
          >
            <input
              type="color"
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              className="h-10 w-10 cursor-pointer rounded border border-neutral-300"
            />
            <input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="New label name"
              className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
            />
            <button
              disabled={!newLabelName.trim() || createLabel.isPending}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Add label
            </button>
          </form>
        </section>

        {canDelete && (
          <section>
            <h2 className="text-lg font-semibold text-red-700">Danger zone</h2>
            <button
              onClick={() => {
                if (confirm(`Delete board "${tree.board.name}" and all its tasks?`)) {
                  deleteBoard.mutate();
                }
              }}
              className="mt-3 rounded border border-red-300 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            >
              Delete board
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
