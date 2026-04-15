"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Label, Task } from "@/lib/api";

const priorityColor: Record<string, string> = {
  low: "bg-neutral-100 text-neutral-600",
  med: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  urgent: "bg-red-100 text-red-700",
};

export function Card({
  task,
  labels,
  onClick,
}: {
  task: Task;
  labels: Label[];
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
    task.deadline_at && !task.completed_at && new Date(task.deadline_at) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="cursor-grab rounded-md border border-neutral-200 bg-white p-3 shadow-sm hover:border-neutral-300"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium">{task.title}</div>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
            priorityColor[task.priority]
          }`}
        >
          {task.priority}
        </span>
      </div>
      {taskLabels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {taskLabels.map((l) => (
            <span
              key={l.id}
              className="rounded px-1.5 py-0.5 text-[10px] text-white"
              style={{ background: l.color }}
            >
              {l.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-[11px] text-neutral-500">
        {task.estimate_hours != null && <span>{task.estimate_hours}h</span>}
        {task.deadline_at && (
          <span className={overdue ? "text-red-600 font-medium" : ""}>
            {new Date(task.deadline_at).toLocaleDateString()}
          </span>
        )}
        {task.is_epic && (
          <span className="rounded bg-purple-100 px-1.5 py-0.5 text-purple-700">
            epic
          </span>
        )}
      </div>
    </div>
  );
}
