"use client";

import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import Link from "next/link";

import { Nav } from "@/components/Nav";
import { Column } from "@/components/board/Column";
import { NewTaskModal } from "@/components/board/NewTaskModal";
import { TaskDrawer } from "@/components/board/TaskDrawer";
import {
  BoardToolbar,
  BoardToolbarHandle,
  ToolbarState,
  defaultToolbarState,
  filterTasks,
} from "@/components/board/BoardToolbar";
import { api, BoardTree, canManageBoards, Task } from "@/lib/api";
import { useBoardStream } from "@/lib/sse";

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const qc = useQueryClient();
  const router = useRouter();
  const [selected, setSelected] = useState<Task | null>(null);
  const [toolbar, setToolbar] = useState<ToolbarState>(defaultToolbarState);
  const [newTaskCol, setNewTaskCol] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const toolbarRef = useRef<BoardToolbarHandle>(null);

  const query = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api<BoardTree>(`/boards/${boardId}`),
  });

  // SSE → refetch (simple, correct, good enough for v1)
  const onStream = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["board", boardId] });
  }, [qc, boardId]);
  useBoardStream(boardId, onStream);

  const moveTask = useMutation({
    mutationFn: ({
      taskId,
      columnId,
      position,
    }: {
      taskId: string;
      columnId: string;
      position: number;
    }) =>
      api<Task>(`/tasks/${taskId}/move`, {
        method: "POST",
        body: JSON.stringify({ column_id: columnId, position }),
      }),
    onMutate: async ({ taskId, columnId, position }) => {
      await qc.cancelQueries({ queryKey: ["board", boardId] });
      const prev = qc.getQueryData<BoardTree>(["board", boardId]);
      if (prev) {
        qc.setQueryData<BoardTree>(["board", boardId], {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === taskId ? { ...t, column_id: columnId, position } : t
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["board", boardId], ctx.prev);
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

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
  const visibleTasks = filterTasks(tree.tasks, toolbar);
  const tasksByCol = (colId: string) =>
    visibleTasks
      .filter((t) => t.column_id === colId)
      .sort((a, b) => a.position - b.position);

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const taskId = String(active.id);
    const task = tree.tasks.find((t) => t.id === taskId);
    if (!task) return;

    let targetCol: string;
    const overData = over.data.current as any;
    if (overData?.type === "column") {
      targetCol = overData.column.id;
    } else if (overData?.type === "task") {
      targetCol = overData.task.column_id;
    } else {
      return;
    }

    const overTaskId = overData?.type === "task" ? overData.task.id : null;
    const siblings = tasksByCol(targetCol).filter((t) => t.id !== taskId);
    let newPos: number;
    if (!overTaskId) {
      newPos = (siblings[siblings.length - 1]?.position ?? 0) + 1;
    } else {
      const idx = siblings.findIndex((t) => t.id === overTaskId);
      const before = siblings[idx - 1]?.position ?? 0;
      const after = siblings[idx]?.position ?? before + 2;
      newPos = (before + after) / 2;
    }
    if (task.column_id === targetCol && task.position === newPos) return;
    moveTask.mutate({ taskId, columnId: targetCol, position: newPos });
  }

  function addTaskShortcut(colId: string) {
    setNewTaskCol(colId);
    setNewTaskOpen(true);
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <div className="border-b bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{tree.board.name}</h1>
            {tree.board.description && (
              <p className="text-xs text-neutral-500">{tree.board.description}</p>
            )}
            <nav className="mt-1 flex gap-4 text-sm">
              <span className="font-medium">Board</span>
              <Link
                href={`/boards/${boardId}/tasks`}
                className="text-neutral-500 hover:underline"
              >
                Tasks
              </Link>
              <Link
                href={`/boards/${boardId}/epics`}
                className="text-neutral-500 hover:underline"
              >
                Epics
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {canManageBoards(tree.your_role) && (
              <Link
                href={`/boards/${boardId}/settings`}
                className="text-neutral-600 hover:underline"
              >
                Settings
              </Link>
            )}
            <Link
              href={`/teams/${tree.board.team_id}`}
              className="text-neutral-500 hover:underline"
            >
              ← back to team
            </Link>
          </div>
        </div>
      </div>
      <BoardToolbar
        ref={toolbarRef}
        tree={tree}
        state={toolbar}
        onChange={setToolbar}
        visibleCount={visibleTasks.length}
        totalCount={tree.tasks.length}
        onNewTask={(colId) => {
          setNewTaskCol(colId ?? null);
          setNewTaskOpen(true);
        }}
      />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4">
            {tree.columns
              .sort((a, b) => a.position - b.position)
              .map((c) => (
                <Column
                  key={c.id}
                  column={c}
                  tasks={tasksByCol(c.id)}
                  labels={tree.labels}
                  onAdd={() => addTaskShortcut(c.id)}
                  onCardClick={(t) => setSelected(t)}
                />
              ))}
          </div>
        </div>
      </DndContext>
      {newTaskOpen && (
        <NewTaskModal
          tree={tree}
          defaultColumnId={newTaskCol ?? undefined}
          onClose={() => {
            setNewTaskOpen(false);
            setNewTaskCol(null);
          }}
        />
      )}
      {selected && (
        <TaskDrawer
          task={tree.tasks.find((t) => t.id === selected.id) ?? selected}
          tree={tree}
          teamId={tree.board.team_id}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
