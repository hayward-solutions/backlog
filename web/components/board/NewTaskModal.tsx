"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BoardTree, Label, Member, Priority, Task, User } from "@/lib/api";

export function NewTaskModal({
  tree,
  defaultColumnId,
  defaultEpicId,
  defaultIsEpic,
  onClose,
}: {
  tree: BoardTree;
  defaultColumnId?: string;
  defaultEpicId?: string;
  defaultIsEpic?: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const teamId = tree.board.team_id;
  const sortedCols = [...tree.columns].sort((a, b) => a.position - b.position);

  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>(`/auth/me`),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [columnId, setColumnId] = useState(defaultColumnId || sortedCols[0]?.id || "");
  const [priority, setPriority] = useState<Priority>("med");
  const [assigneeId, setAssigneeId] = useState("");
  const [reporterId, setReporterId] = useState("");
  const [estimate, setEstimate] = useState("");
  const [deadline, setDeadline] = useState("");
  const [epicId, setEpicId] = useState(defaultEpicId || "");
  const [isEpic, setIsEpic] = useState(!!defaultIsEpic);
  const [labelIds, setLabelIds] = useState<string[]>([]);

  useEffect(() => {
    if (!reporterId && me.data?.id) setReporterId(me.data.id);
  }, [me.data?.id, reporterId]);

  const create = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title: title.trim(),
        description,
        column_id: columnId,
        priority,
        is_epic: isEpic,
        label_ids: labelIds,
      };
      if (assigneeId) body.assignee_id = assigneeId;
      if (reporterId) body.reporter_id = reporterId;
      if (estimate) body.estimate_hours = Number(estimate);
      if (deadline) body.deadline_at = new Date(deadline).toISOString();
      if (epicId) body.epic_id = epicId;
      return api<Task>(`/boards/${tree.board.id}/tasks`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["board", tree.board.id] });
      onClose();
    },
    onError: (e: Error) => alert(e.message),
  });

  const canSubmit = title.trim() && columnId && reporterId && !create.isPending;
  const epics = tree.tasks.filter((t) => t.is_epic);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-[640px] max-w-full max-h-[90vh] overflow-y-auto rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="text-sm font-semibold">New task</h2>
          <button onClick={onClose} className="text-neutral-500">
            ✕
          </button>
        </header>
        <form
          className="space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) create.mutate();
          }}
        >
          <label className="block">
            <span className="text-xs text-neutral-500">Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="block">
            <span className="text-xs text-neutral-500">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>
              <span className="text-xs text-neutral-500">Column</span>
              <select
                value={columnId}
                onChange={(e) => setColumnId(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              >
                {sortedCols.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs text-neutral-500">Priority</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
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
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
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
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
                required
              >
                {(members.data ?? []).map((m) => (
                  <option key={m.user.id} value={m.user.id}>
                    {m.user.display_name || m.user.email}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-xs text-neutral-500">Estimate (h)</span>
              <input
                type="number"
                step="0.25"
                min="0"
                value={estimate}
                onChange={(e) => setEstimate(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              />
            </label>
            <label>
              <span className="text-xs text-neutral-500">Deadline</span>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
              />
            </label>
            <label className="col-span-2">
              <span className="text-xs text-neutral-500">Epic</span>
              <select
                value={epicId}
                onChange={(e) => setEpicId(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1"
                disabled={isEpic}
              >
                <option value="">(none)</option>
                {epics.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={isEpic}
                onChange={(e) => {
                  setIsEpic(e.target.checked);
                  if (e.target.checked) setEpicId("");
                }}
              />
              <span className="text-xs text-neutral-600">This task is an epic</span>
            </label>
          </div>

          {tree.labels.length > 0 && (
            <div>
              <span className="text-xs text-neutral-500">Labels</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {tree.labels.map((l: Label) => {
                  const on = labelIds.includes(l.id);
                  return (
                    <button
                      type="button"
                      key={l.id}
                      onClick={() =>
                        setLabelIds((cur) =>
                          cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id]
                        )
                      }
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
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded border px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              disabled={!canSubmit}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {create.isPending ? "Creating…" : "Create task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
