"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Label, Member, Task } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, LabelPill } from "@/components/ui/Badge";
import { IconCalendar, IconClock, IconEpic } from "@/components/ui/icons";
import { PriorityIcon } from "@/components/ui/PriorityIcon";

/** Ordered list of keys from the top-most epic down to this task. */
export function taskPath(task: Task, allTasks: Task[]): string[] {
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  const chain: string[] = [task.key];
  const seen = new Set<string>([task.id]);
  let cur: Task | undefined = task;
  while (cur?.epic_id) {
    if (seen.has(cur.epic_id)) break; // guard against cycles
    const parent = byId.get(cur.epic_id);
    if (!parent) break;
    chain.unshift(parent.key);
    seen.add(parent.id);
    cur = parent;
  }
  return chain;
}

function formatDueDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays}d`;
  if (diffDays < -1 && diffDays > -7) return `${Math.abs(diffDays)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function Card({
  task,
  labels,
  members,
  onClick,
}: {
  task: Task;
  labels: Label[];
  members: Member[];
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, data: { type: "task", task } });
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };
  const taskLabels = labels.filter((l) => task.label_ids.includes(l.id));
  const overdue =
    task.due_at && !task.completed_at && new Date(task.due_at) < new Date();
  const assignee = task.assignee_id
    ? members.find((m) => m.user.id === task.assignee_id)?.user
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="card-hover group cursor-grab rounded-md border border-ink-200 bg-white p-3 shadow-card active:cursor-grabbing"
    >
      {/* Labels strip */}
      {taskLabels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {taskLabels.map((l) => (
            <LabelPill key={l.id} name={l.name} color={l.color} />
          ))}
        </div>
      )}

      {/* Title */}
      <div className="text-[13.5px] font-medium leading-snug text-ink-900">
        {task.title}
      </div>

      {/* Meta row */}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.is_epic ? (
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-purple-600 text-white">
              <IconEpic size={11} strokeWidth={2.25} />
            </span>
          ) : (
            <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-brand-50 text-brand-700">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="3" />
              </svg>
            </span>
          )}
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            {task.key}
          </span>
          <PriorityIcon priority={task.priority} size={13} />
        </div>

        <div className="flex items-center gap-2 text-[11px] text-ink-500">
          {task.estimate_hours != null && (
            <span className="inline-flex items-center gap-0.5">
              <IconClock size={11} />
              {task.estimate_hours}h
            </span>
          )}
          {task.due_at && (
            <span
              className={`inline-flex items-center gap-0.5 ${
                overdue ? "font-semibold text-danger-600" : ""
              }`}
              title={`Due ${new Date(task.due_at).toLocaleString()}`}
            >
              <IconCalendar size={11} />
              {formatDueDate(task.due_at)}
            </span>
          )}
          {assignee ? (
            <Avatar
              name={assignee.display_name || assignee.email}
              seed={assignee.id}
              size={20}
              title={assignee.display_name || assignee.email}
            />
          ) : (
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-dashed border-ink-300 text-ink-400"
              title="Unassigned"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21a8 8 0 0 1 16 0" />
              </svg>
            </span>
          )}
          {task.completed_at && <Badge tone="green">Done</Badge>}
        </div>
      </div>
    </div>
  );
}
