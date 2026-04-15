"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BoardTree, Label, Member, Priority, Task, User } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import { LabelPill } from "@/components/ui/Badge";
import { priorityLabel } from "@/components/ui/PriorityIcon";

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

  const canSubmit = !!title.trim() && !!columnId && !!reporterId && !create.isPending;
  const epics = tree.tasks.filter((t) => t.is_epic);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (canSubmit) create.mutate();
  }

  return (
    <Modal
      title={isEpic ? "Create epic" : "Create task"}
      onClose={onClose}
      width={680}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit}
            onClick={() => canSubmit && create.mutate()}
          >
            {create.isPending ? "Creating…" : isEpic ? "Create epic" : "Create task"}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title">
          <Input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs to be done?"
            required
          />
        </Field>
        <Field label="Description" hint="Markdown supported in future versions.">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Add more detail…"
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Column">
            <Select
              value={columnId}
              onChange={(e) => setColumnId(e.target.value)}
              className="w-full"
            >
              {sortedCols.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="w-full"
            >
              {(["low", "med", "high", "urgent"] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {priorityLabel(p)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Assignee">
            <Select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="w-full"
            >
              <option value="">Unassigned</option>
              {(members.data ?? []).map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.display_name || m.user.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Reporter">
            <Select
              value={reporterId}
              onChange={(e) => setReporterId(e.target.value)}
              className="w-full"
              required
            >
              {(members.data ?? []).map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.display_name || m.user.email}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estimate (hours)">
            <Input
              type="number"
              step="0.25"
              min="0"
              value={estimate}
              onChange={(e) => setEstimate(e.target.value)}
              placeholder="e.g. 2.5"
            />
          </Field>
          <Field label="Deadline">
            <Input
              type="datetime-local"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </Field>
          <Field label="Epic" className="sm:col-span-2">
            <Select
              value={epicId}
              onChange={(e) => setEpicId(e.target.value)}
              disabled={isEpic}
              className="w-full"
            >
              <option value="">(none)</option>
              {epics.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-2 rounded-md border border-ink-200 bg-ink-50 px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={isEpic}
            className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
            onChange={(e) => {
              setIsEpic(e.target.checked);
              if (e.target.checked) setEpicId("");
            }}
          />
          <span className="font-medium text-ink-800">This task is an epic</span>
          <span className="text-ink-500">— groups child tasks under a shared goal.</span>
        </label>

        {tree.labels.length > 0 && (
          <Field label="Labels">
            <div className="flex flex-wrap gap-2">
              {tree.labels.map((l: Label) => {
                const on = labelIds.includes(l.id);
                return (
                  <LabelPill
                    key={l.id}
                    name={l.name}
                    color={l.color}
                    selected={on}
                    onClick={() =>
                      setLabelIds((cur) =>
                        cur.includes(l.id)
                          ? cur.filter((x) => x !== l.id)
                          : [...cur, l.id]
                      )
                    }
                  />
                );
              })}
            </div>
          </Field>
        )}
      </form>
    </Modal>
  );
}
