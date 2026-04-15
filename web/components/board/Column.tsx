"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Column as ColumnT, Label, Task } from "@/lib/api";
import { Card } from "./Card";

export function Column({
  column,
  tasks,
  labels,
  onAdd,
  onCardClick,
}: {
  column: ColumnT;
  tasks: Task[];
  labels: Label[];
  onAdd: () => void;
  onCardClick: (t: Task) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: "column", column },
  });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-lg bg-neutral-100">
      <header className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{column.name}</span>
          <span className="text-xs text-neutral-500">{tasks.length}</span>
        </div>
        <button
          onClick={onAdd}
          className="text-neutral-400 hover:text-neutral-700"
          title="Add task"
        >
          +
        </button>
      </header>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2 p-2 min-h-[80px] ${
          isOver ? "bg-neutral-200/60" : ""
        }`}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((t) => (
            <Card key={t.id} task={t} labels={labels} onClick={() => onCardClick(t)} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}
