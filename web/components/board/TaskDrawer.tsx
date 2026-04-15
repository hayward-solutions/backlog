"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, BoardTree, Label, Member, Priority, Task } from "@/lib/api";

export function TaskDrawer({
  task,
  tree,
  teamId,
  onClose,
}: {
  task: Task;
  tree: BoardTree;
  teamId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? "");
  const [reporterId, setReporterId] = useState(task.reporter_id);
  const [estimate, setEstimate] = useState(
    task.estimate_hours != null ? String(task.estimate_hours) : ""
  );
  const [deadline, setDeadline] = useState(
    task.deadline_at ? task.deadline_at.slice(0, 16) : ""
  );
  const [labelIds, setLabelIds] = useState<string[]>(task.label_ids);
  const [epicId, setEpicId] = useState(task.epic_id ?? "");

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setAssigneeId(task.assignee_id ?? "");
    setReporterId(task.reporter_id);
    setEstimate(task.estimate_hours != null ? String(task.estimate_hours) : "");
    setDeadline(task.deadline_at ? task.deadline_at.slice(0, 16) : "");
    setLabelIds(task.label_ids);
    setEpicId(task.epic_id ?? "");
  }, [task.id]);

  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });
  const events = useQuery({
    queryKey: ["events", task.id],
    queryFn: () => api<any[]>(`/tasks/${task.id}/events`),
  });

  const save = useMutation({
    mutationFn: () => {
      const body: any = {
        title,
        description,
        priority,
        label_ids: labelIds,
      };
      if (assigneeId) body.assignee_id = assigneeId;
      else body.clear_assignee = true;
      if (estimate) body.estimate_hours = Number(estimate);
      else body.clear_estimate = true;
      if (deadline) body.deadline_at = new Date(deadline).toISOString();
      else body.clear_deadline = true;
      if (epicId) body.epic_id = epicId;
      else body.clear_epic = true;
      if (reporterId && reporterId !== task.reporter_id) body.reporter_id = reporterId;
      return api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", task.board_id] });
      qc.invalidateQueries({ queryKey: ["events", task.id] });
    },
  });

  const del = useMutation({
    mutationFn: () => api(`/tasks/${task.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", task.board_id] });
      onClose();
    },
  });

  const saveLabels = useMutation({
    mutationFn: (ids: string[]) =>
      api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label_ids: ids }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", task.board_id] });
      qc.invalidateQueries({ queryKey: ["events", task.id] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const toggleLabel = (id: string) => {
    const next = labelIds.includes(id)
      ? labelIds.filter((x) => x !== id)
      : [...labelIds, id];
    setLabelIds(next);
    saveLabels.mutate(next);
  };

  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#888888");
  const createLabel = useMutation({
    mutationFn: () =>
      api<Label>(`/teams/${teamId}/labels`, {
        method: "POST",
        body: JSON.stringify({ name: newLabelName.trim(), color: newLabelColor }),
      }),
    onSuccess: (l) => {
      setNewLabelName("");
      const next = [...labelIds, l.id];
      setLabelIds(next);
      qc.invalidateQueries({ queryKey: ["board", task.board_id] });
      qc.invalidateQueries({ queryKey: ["labels", teamId] });
      saveLabels.mutate(next);
    },
    onError: (e: Error) => alert(e.message),
  });

  const epics = tree.tasks.filter((t) => t.is_epic && t.id !== task.id);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <aside className="w-[480px] max-w-full overflow-y-auto bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <span className="text-xs text-neutral-500">Task</span>
          <button onClick={onClose} className="text-neutral-500">
            ✕
          </button>
        </header>
        <div className="space-y-4 p-5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full border-b border-neutral-200 py-2 text-lg font-semibold outline-none"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            placeholder="Description"
            className="w-full rounded border border-neutral-200 p-2 text-sm"
          />

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="text-xs text-neutral-500">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="low">low</option>
                <option value="med">med</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
            </label>
            <label>
              <span className="text-xs text-neutral-500">Assignee</span>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="">(unassigned)</option>
                {(members.data ?? []).map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.display_name || m.user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs text-neutral-500">Reporter</span>
              <select
                value={reporterId}
                onChange={(e) => setReporterId(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                {(members.data ?? []).map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.display_name || m.user.email}
                  </option>
                ))}
                {!(members.data ?? []).some((m) => m.user.id === reporterId) && (
                  <option value={reporterId}>(unknown user)</option>
                )}
              </select>
            </label>
            <label>
              <span className="text-xs text-neutral-500">Estimate (h)</span>
              <input
                type="number"
                step="0.25"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label>
              <span className="text-xs text-neutral-500">Deadline</span>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              />
            </label>
            <label className="col-span-2">
              <span className="text-xs text-neutral-500">Epic</span>
              <select
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                className="mt-1 w-full rounded border px-2 py-1"
              >
                <option value="">(none)</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div>
            <span className="text-xs text-neutral-500">Labels</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {tree.labels.length === 0 && (
                <span className="text-xs text-neutral-400">
                  No labels yet — create one below.
                </span>
              )}
              {tree.labels.map((l: Label) => {
                const on = labelIds.includes(l.id);
                return (
                  <button
                    type="button"
                    key={l.id}
                    onClick={() => toggleLabel(l.id)}
                    className={`rounded border px-2 py-0.5 text-xs ${
                      on ? "text-white" : "text-neutral-700"
                    }`}
                    style={{
                      borderColor: l.color,
                      background: on ? l.color : "transparent",
                    }}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
            <form
              className="mt-2 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newLabelName.trim() && !createLabel.isPending) createLabel.mutate();
              }}
            >
              <input
                value={newLabelName}
                onChange={(e) => setNewLabelName(e.target.value)}
                placeholder="New label name"
                className="rounded border border-neutral-300 px-2 py-1 text-xs"
              />
              <input
                type="color"
                value={newLabelColor}
                onChange={(e) => setNewLabelColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded border border-neutral-300"
              />
              <button
                type="submit"
                disabled={!newLabelName.trim() || createLabel.isPending}
                className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>

          <div className="flex gap-2">
            <button
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => del.mutate()}
              className="rounded border border-red-300 px-4 py-2 text-sm text-red-600"
            >
              Delete
            </button>
          </div>

          <section className="mt-6 border-t pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Activity
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-neutral-600">
              {(events.data ?? []).map((e) => (
                <li key={e.id}>
                  <span className="text-neutral-400">
                    {new Date(e.created_at).toLocaleString()}
                  </span>{" "}
                  <span className="font-medium">{e.kind}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </aside>
    </div>
  );
}
