"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, BoardTree, Label, Member, Priority, Task, User } from "@/lib/api";
import { Drawer } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { LabelPill } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { PriorityIcon, priorityLabel } from "@/components/ui/PriorityIcon";
import { IconEpic, IconTrash } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/Markdown";
import { Comments } from "./Comments";
import { Attachments } from "./Attachments";
import { taskPath } from "./Card";

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
  const [startAt, setStartAt] = useState(
    task.start_at ? task.start_at.slice(0, 16) : ""
  );
  const [dueAt, setDueAt] = useState(
    task.due_at ? task.due_at.slice(0, 16) : ""
  );
  const [labelIds, setLabelIds] = useState<string[]>(task.label_ids);
  const [epicId, setEpicId] = useState(task.epic_id ?? "");
  const [editDesc, setEditDesc] = useState(false);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });
  // Anyone who can see the task can comment and attach.
  const canComment = true;

  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setAssigneeId(task.assignee_id ?? "");
    setReporterId(task.reporter_id);
    setEstimate(task.estimate_hours != null ? String(task.estimate_hours) : "");
    setStartAt(task.start_at ? task.start_at.slice(0, 16) : "");
    setDueAt(task.due_at ? task.due_at.slice(0, 16) : "");
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
      if (startAt) body.start_at = new Date(startAt).toISOString();
      else body.clear_start = true;
      if (dueAt) body.due_at = new Date(dueAt).toISOString();
      else body.clear_due = true;
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

  // Auto-save metadata fields on commit so the drawer's primary "Save changes"
  // button isn't required for individual edits. Title and description still
  // stage since free-text on-keystroke saves aren't desirable.
  const savePartial = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Task>(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", task.board_id] });
      qc.invalidateQueries({ queryKey: ["events", task.id] });
    },
    onError: (e: Error) => alert(e.message),
  });

  function commitTitle(next: string) {
    const trimmed = next.trim();
    if (!trimmed || trimmed === task.title) return;
    savePartial.mutate({ title: trimmed });
  }

  function commitPriority(next: Priority) {
    if (next === task.priority) return;
    savePartial.mutate({ priority: next });
  }

  function commitAssignee(next: string) {
    const current = task.assignee_id ?? "";
    if (next === current) return;
    savePartial.mutate(next ? { assignee_id: next } : { clear_assignee: true });
  }

  function commitReporter(next: string) {
    if (!next || next === task.reporter_id) return;
    savePartial.mutate({ reporter_id: next });
  }

  function commitEstimate(next: string) {
    const current = task.estimate_hours != null ? String(task.estimate_hours) : "";
    if (next === current) return;
    if (next === "") {
      savePartial.mutate({ clear_estimate: true });
      return;
    }
    const n = Number(next);
    if (Number.isNaN(n)) return;
    savePartial.mutate({ estimate_hours: n });
  }

  function commitEpic(next: string) {
    const current = task.epic_id ?? "";
    if (next === current) return;
    savePartial.mutate(next ? { epic_id: next } : { clear_epic: true });
  }

  function commitStartAt(next: string) {
    const current = task.start_at ? task.start_at.slice(0, 16) : "";
    if (next === current) return;
    savePartial.mutate(
      next ? { start_at: new Date(next).toISOString() } : { clear_start: true }
    );
  }

  function commitDueAt(next: string) {
    const current = task.due_at ? task.due_at.slice(0, 16) : "";
    if (next === current) return;
    savePartial.mutate(
      next ? { due_at: new Date(next).toISOString() } : { clear_due: true }
    );
  }

  const toggleLabel = (id: string) => {
    const next = labelIds.includes(id)
      ? labelIds.filter((x) => x !== id)
      : [...labelIds, id];
    setLabelIds(next);
    saveLabels.mutate(next);
  };

  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#6E5DC6");
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
  const col = tree.columns.find((c) => c.id === task.column_id);

  return (
    <Drawer
      title={task.is_epic ? "Epic" : "Task"}
      subtitle={
        <span className="flex items-center gap-1.5">
          <span className="font-mono font-semibold text-ink-700">
            {taskPath(task, tree.tasks).map((k, i, arr) => (
              <span key={`${k}-${i}`}>
                {i > 0 && <span className="mx-1 text-ink-300">/</span>}
                <span className={i === arr.length - 1 ? "text-ink-800" : "text-ink-500"}>
                  {k}
                </span>
              </span>
            ))}
          </span>
          {col && (
            <>
              <span className="text-ink-300">•</span>
              <span>{col.name}</span>
            </>
          )}
        </span>
      }
      onClose={onClose}
      width={560}
      actions={
        <button
          title="Delete task"
          className="rounded-xs p-1 text-ink-500 hover:bg-danger-50 hover:text-danger-600"
          onClick={() => {
            if (confirm("Delete this task?")) del.mutate();
          }}
        >
          <IconTrash size={16} />
        </button>
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-5">
        {/* Title + kind */}
        <div className="flex items-start gap-2">
          {task.is_epic && (
            <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-purple-600 text-white">
              <IconEpic size={13} strokeWidth={2.25} />
            </span>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-full rounded-md border border-transparent bg-transparent px-2 py-1 text-[18px] font-semibold leading-tight text-ink-900 outline-none hover:bg-ink-50 focus:border-ink-200 focus:bg-white focus:shadow-focus"
          />
        </div>

        {/* Description */}
        <Field label="Description">
          {editDesc ? (
            <div className="space-y-2">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                placeholder="Add a description… (markdown supported, images via attachment:<id>)"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    save.mutate(undefined, { onSuccess: () => setEditDesc(false) });
                  }}
                  disabled={save.isPending}
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDescription(task.description);
                    setEditDesc(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="cursor-text rounded-md border border-transparent px-2 py-1 hover:border-ink-200"
              onClick={() => setEditDesc(true)}
              role="button"
              tabIndex={0}
            >
              {description ? (
                <Markdown source={description} />
              ) : (
                <span className="text-sm text-ink-500">Add a description…</span>
              )}
            </div>
          )}
        </Field>

        {/* Properties panel */}
        <section className="rounded-md border border-ink-200 bg-white">
          <div className="border-b border-ink-100 px-4 py-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            Details
          </div>
          <div className="divide-y divide-ink-100 text-sm">
            <PropertyRow label="Status">
              <span className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    col?.type === "done"
                      ? "bg-success-500"
                      : col?.type === "in_progress"
                      ? "bg-brand-500"
                      : "bg-ink-400"
                  }`}
                />
                <span className="text-ink-800">{col?.name ?? "—"}</span>
              </span>
            </PropertyRow>
            <PropertyRow label="Priority">
              <div className="flex items-center gap-2">
                <PriorityIcon priority={priority} size={14} />
                <Select
                  value={priority}
                  onChange={(e) => {
                    const next = e.target.value as Priority;
                    setPriority(next);
                    commitPriority(next);
                  }}
                  className="w-full sm:w-40"
                >
                  {(["low", "med", "high", "urgent"] as Priority[]).map((p) => (
                    <option key={p} value={p}>
                      {priorityLabel(p)}
                    </option>
                  ))}
                </Select>
              </div>
            </PropertyRow>
            <PropertyRow label="Assignee">
              <div className="flex items-center gap-2">
                {assigneeId ? (
                  <Avatar
                    name={
                      members.data?.find((m) => m.user.id === assigneeId)?.user.display_name ||
                      "?"
                    }
                    seed={assigneeId}
                    size={20}
                  />
                ) : (
                  <span className="h-5 w-5 rounded-full border border-dashed border-ink-300" />
                )}
                <Select
                  value={assigneeId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setAssigneeId(next);
                    commitAssignee(next);
                  }}
                  className="w-full sm:w-56"
                >
                  <option value="">Unassigned</option>
                  {(members.data ?? []).map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.display_name || m.user.email}
                    </option>
                  ))}
                </Select>
              </div>
            </PropertyRow>
            <PropertyRow label="Reporter">
              <div className="flex items-center gap-2">
                <Avatar
                  name={
                    members.data?.find((m) => m.user.id === reporterId)?.user
                      .display_name || "?"
                  }
                  seed={reporterId}
                  size={20}
                />
                <Select
                  value={reporterId}
                  onChange={(e) => {
                    const next = e.target.value;
                    setReporterId(next);
                    commitReporter(next);
                  }}
                  className="w-full sm:w-56"
                >
                  {(members.data ?? []).map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.display_name || m.user.email}
                    </option>
                  ))}
                  {!(members.data ?? []).some((m) => m.user.id === reporterId) && (
                    <option value={reporterId}>(unknown user)</option>
                  )}
                </Select>
              </div>
            </PropertyRow>
            <PropertyRow label="Estimate">
              <Input
                type="number"
                step="0.25"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                onBlur={(e) => commitEstimate(e.target.value)}
                placeholder="hours"
                className="w-full sm:w-32"
              />
            </PropertyRow>
            <PropertyRow label="Start">
              <Input
                type="datetime-local"
                value={startAt}
                onChange={(e) => {
                  setStartAt(e.target.value);
                  commitStartAt(e.target.value);
                }}
                onBlur={(e) => commitStartAt(e.target.value)}
                className="w-56"
              />
            </PropertyRow>
            <PropertyRow label="Due">
              <Input
                type="datetime-local"
                value={dueAt}
                onChange={(e) => {
                  setDueAt(e.target.value);
                  commitDueAt(e.target.value);
                }}
                onBlur={(e) => commitDueAt(e.target.value)}
                className="w-56"
              />
            </PropertyRow>
            <PropertyRow label="Epic">
              <Select
                value={epicId}
                onChange={(e) => {
                  const next = e.target.value;
                  setEpicId(next);
                  commitEpic(next);
                }}
                className="w-full"
              >
                <option value="">(none)</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </Select>
            </PropertyRow>
          </div>
        </section>

        {/* Labels */}
        <section>
          <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            Labels
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {tree.labels.length === 0 && (
              <span className="text-xs text-ink-500">
                No labels yet — create one below.
              </span>
            )}
            {tree.labels.map((l: Label) => {
              const on = labelIds.includes(l.id);
              return (
                <LabelPill
                  key={l.id}
                  name={l.name}
                  color={l.color}
                  selected={on}
                  onClick={() => toggleLabel(l.id)}
                />
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
            <Input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="New label"
              className="flex-1"
            />
            <input
              type="color"
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              className="h-8 w-10 shrink-0 cursor-pointer rounded-md border border-ink-200"
            />
            <Button
              type="submit"
              disabled={!newLabelName.trim() || createLabel.isPending}
              size="sm"
            >
              Add
            </Button>
          </form>
        </section>

        {/* Attachments */}
        <div className="border-t border-ink-200 pt-4">
          <Attachments taskId={task.id} teamId={teamId} canEdit={canComment} />
        </div>

        {/* Comments */}
        <div className="border-t border-ink-200 pt-4">
          <Comments
            taskId={task.id}
            teamId={teamId}
            currentUserId={me.data?.id ?? ""}
            canComment={canComment}
          />
        </div>

        {/* Activity */}
        <section className="border-t border-ink-200 pt-4">
          <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
            Activity
          </h3>
          <ul className="space-y-2">
            {(events.data ?? []).map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-300" />
                <div>
                  <span className="font-medium text-ink-800">{formatEvent(e.kind)}</span>
                  <span className="ml-2 text-ink-500">
                    {new Date(e.created_at).toLocaleString()}
                  </span>
                </div>
              </li>
            ))}
            {(events.data ?? []).length === 0 && (
              <li className="text-xs text-ink-500">No activity yet.</li>
            )}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 px-4 py-2 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs text-ink-600 sm:w-20 sm:shrink-0">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function formatEvent(kind: string): string {
  // Turn "task.updated" / "task_moved" / "label.added" into "Task updated" / "Label added"
  return kind
    .replace(/^[a-z]+[._]/, "")
    .replace(/[._]/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}
