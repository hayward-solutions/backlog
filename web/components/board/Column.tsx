"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column as ColumnT, ColumnType, Label, Member, Task } from "@/lib/api";
import { Card } from "./Card";
import { IconPlus } from "@/components/ui/icons";

const accentByType: Record<ColumnType, { bar: string; text: string; dot: string }> = {
  todo: { bar: "bg-ink-300", text: "text-ink-600", dot: "bg-ink-400" },
  in_progress: {
    bar: "bg-brand-500",
    text: "text-brand-700",
    dot: "bg-brand-500",
  },
  done: { bar: "bg-success-500", text: "text-success-700", dot: "bg-success-500" },
};

export function Column({
  column,
  tasks,
  labels,
  members,
  onAdd,
  onCardClick,
}: {
  column: ColumnT;
  tasks: Task[];
  labels: Label[];
  members: Member[];
  onAdd: () => void;
  onCardClick: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });
  const accent = accentByType[column.type];
  const atLimit = column.wip_limit != null && tasks.length > column.wip_limit;

  return (
    <div className="flex w-[296px] shrink-0 flex-col overflow-hidden rounded-lg border border-ink-200 bg-ink-50">
      {/* Top accent bar */}
      <div className={`h-1 w-full ${accent.bar}`} />

      {/* Header */}
      <header className="flex items-center justify-between px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-700">
            {column.name}
          </span>
          <span
            className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-semibold ${
              atLimit
                ? "bg-danger-50 text-danger-700"
                : "bg-white text-ink-600 ring-1 ring-inset ring-ink-200"
            }`}
          >
            {tasks.length}
            {column.wip_limit != null && (
              <span className="text-ink-400">/{column.wip_limit}</span>
            )}
          </span>
        </div>
        <button
          onClick={onAdd}
          className="flex h-6 w-6 items-center justify-center rounded-md text-ink-500 hover:bg-ink-200 hover:text-ink-900"
          title="Add task to this column"
          aria-label={`Add task to ${column.name}`}
        >
          <IconPlus size={14} strokeWidth={2.25} />
        </button>
      </header>

      {/* Dropzone */}
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-3 pt-0.5 transition ${
          isOver ? "bg-brand-50/50" : ""
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <Card
              key={t.id}
              task={t}
              labels={labels}
              members={members}
              onClick={() => onCardClick(t)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <button
            onClick={onAdd}
            className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-ink-300 py-4 text-xs text-ink-500 hover:border-ink-400 hover:bg-white hover:text-ink-700"
          >
            <IconPlus size={12} /> Add task
          </button>
        )}
      </div>
    </div>
  );
}
