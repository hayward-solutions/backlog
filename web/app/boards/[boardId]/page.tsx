"use client";

import {
  DndContext,
  DragEndEvent,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
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
import { api, BoardTree, Member, Task } from "@/lib/api";
import { useBoardStream } from "@/lib/sse";

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const [toolbar, setToolbar] = useState<ToolbarState>(defaultToolbarState);
  const [newTaskCol, setNewTaskCol] = useState<string | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const toolbarRef = useRef<BoardToolbarHandle>(null);

  const query = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api<BoardTree>(`/boards/${boardId}`),
  });

  const teamId = query.data?.board.team_id;
  const members = useQuery({
    enabled: !!teamId,
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });

  const onStream = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["board", boardId] });
  }, [qc, boardId]);
  useBoardStream(boardId, onStream);

  // Deep-link: open the drawer for a task/epic referenced by ?task=<id>.
  // The URL is the single source of truth for which task the drawer is open to,
  // so opening/closing only needs to update the query string.
  const taskParam = searchParams.get("task");

  const openTask = useCallback(
    (t: Task) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("task", t.id);
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const closeTask = useCallback(() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.delete("task");
    const qs = sp.toString();
    router.replace(qs ? `?${qs}` : "?", { scroll: false });
  }, [router, searchParams]);

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
    onSettled: () => qc.invalidateQueries({ queryKey: ["board", boardId] }),
  });

  // Use MouseSensor for desktop (drag on small movement) and TouchSensor with a
  // press-and-hold delay on touch devices so vertical/horizontal scrolling of
  // the board still works naturally on mobile.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 220, tolerance: 8 },
    })
  );

  if (query.isLoading) {
    return (
      <AppShell boardId={boardId}>
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
          Loading board…
        </div>
      </AppShell>
    );
  }
  if (query.error) {
    return (
      <AppShell boardId={boardId}>
        <div className="p-6 text-sm text-danger-600">
          {(query.error as Error).message}
        </div>
      </AppShell>
    );
  }
  const tree = query.data!;
  const selected = taskParam
    ? tree.tasks.find((t) => t.id === taskParam) ?? null
    : null;
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
    <AppShell
      boardId={boardId}
      teamId={tree.board.team_id}
      topSlot={
        <div className="flex items-center gap-3">
          <Breadcrumbs
            items={[
              { label: "Teams", href: "/teams" },
              { label: tree.team_name, href: `/teams/${tree.board.team_id}` },
              { label: tree.board.name },
            ]}
          />
        </div>
      }
    >
      <div className="border-b border-ink-200 bg-ink-0 px-4 py-3 sm:py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-[18px] font-semibold tracking-tight text-ink-900 sm:text-[20px]">
              {tree.board.name}
            </h1>
            {tree.board.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">
                {tree.board.description}
              </p>
            )}
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
        <div className="flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden bg-ink-50 sm:snap-none">
          <div className="flex h-full min-w-min gap-3 p-3 sm:p-6">
            {tree.columns
              .sort((a, b) => a.position - b.position)
              .map((c) => (
                <Column
                  key={c.id}
                  column={c}
                  tasks={tasksByCol(c.id)}
                  labels={tree.labels}
                  members={members.data ?? []}
                  onAdd={() => addTaskShortcut(c.id)}
                  onCardClick={openTask}
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
          task={selected}
          tree={tree}
          teamId={tree.board.team_id}
          onClose={closeTask}
        />
      )}
    </AppShell>
  );
}
