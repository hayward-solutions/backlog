"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { NewTaskModal } from "@/components/board/NewTaskModal";
import { TaskDrawer } from "@/components/board/TaskDrawer";
import {
  BoardToolbar,
  ToolbarState,
  defaultToolbarState,
  filterTasks,
} from "@/components/board/BoardToolbar";
import { api, BoardTree, Member, Task } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, LabelPill } from "@/components/ui/Badge";
import { PriorityIcon } from "@/components/ui/PriorityIcon";
import { IconArrowDown, IconArrowUp, IconCalendar, IconEpic } from "@/components/ui/icons";

type SortKey =
  | "title"
  | "column"
  | "priority"
  | "assignee"
  | "reporter"
  | "start"
  | "due"
  | "estimate"
  | "created";

const priorityRank: Record<string, number> = { low: 0, med: 1, high: 2, urgent: 3 };

export default function BoardTasksPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [toolbar, setToolbar] = useState<ToolbarState>(defaultToolbarState);
  const [selected, setSelected] = useState<Task | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskCol, setNewTaskCol] = useState<string | null>(null);

  const tree = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api<BoardTree>(`/boards/${boardId}`),
  });
  const teamId = tree.data?.board.team_id;
  const members = useQuery({
    enabled: !!teamId,
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });

  const colById = useMemo(() => {
    const m = new Map<string, { name: string; type: string }>();
    tree.data?.columns.forEach((c) => m.set(c.id, { name: c.name, type: c.type }));
    return m;
  }, [tree.data]);

  const userById = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    members.data?.forEach((mem) =>
      m.set(mem.user.id, { name: mem.user.display_name || mem.user.email, id: mem.user.id })
    );
    return m;
  }, [members.data]);

  const labelById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    tree.data?.labels.forEach((l) => m.set(l.id, { name: l.name, color: l.color }));
    return m;
  }, [tree.data]);

  const rows = useMemo(() => {
    const tasks = tree.data?.tasks ?? [];
    const filtered = filterTasks(tasks, toolbar);
    const mult = dir === "asc" ? 1 : -1;
    const cmp = (a: Task, b: Task): number => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title) * mult;
        case "column": {
          const an = colById.get(a.column_id)?.name ?? "";
          const bn = colById.get(b.column_id)?.name ?? "";
          return an.localeCompare(bn) * mult;
        }
        case "priority":
          return (priorityRank[a.priority] - priorityRank[b.priority]) * mult;
        case "assignee": {
          const an = a.assignee_id ? userById.get(a.assignee_id)?.name ?? "" : "";
          const bn = b.assignee_id ? userById.get(b.assignee_id)?.name ?? "" : "";
          return an.localeCompare(bn) * mult;
        }
        case "reporter": {
          const an = userById.get(a.reporter_id)?.name ?? "";
          const bn = userById.get(b.reporter_id)?.name ?? "";
          return an.localeCompare(bn) * mult;
        }
        case "start": {
          const av = a.start_at ? new Date(a.start_at).getTime() : Infinity;
          const bv = b.start_at ? new Date(b.start_at).getTime() : Infinity;
          return (av - bv) * mult;
        }
        case "due": {
          const av = a.due_at ? new Date(a.due_at).getTime() : Infinity;
          const bv = b.due_at ? new Date(b.due_at).getTime() : Infinity;
          return (av - bv) * mult;
        }
        case "estimate":
          return ((a.estimate_hours ?? 0) - (b.estimate_hours ?? 0)) * mult;
        case "created":
          return (
            (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * mult
          );
      }
    };
    return [...filtered].sort(cmp);
  }, [tree.data, toolbar, sort, dir, colById, userById]);

  if (tree.isLoading) {
    return (
      <AppShell boardId={boardId}>
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
          Loading…
        </div>
      </AppShell>
    );
  }
  if (tree.error) {
    return (
      <AppShell boardId={boardId}>
        <div className="p-6 text-sm text-danger-600">
          {(tree.error as Error).message}
        </div>
      </AppShell>
    );
  }
  const data = tree.data!;

  function toggle(k: SortKey) {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  }

  return (
    <AppShell
      boardId={boardId}
      teamId={data.board.team_id}
      topSlot={
        <Breadcrumbs
          items={[
            { label: "Teams", href: "/teams" },
            { label: data.team_name, href: `/teams/${data.board.team_id}` },
            { label: data.board.name, href: `/boards/${boardId}` },
            { label: "Tasks" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
          Tasks
        </h1>
        <p className="text-sm text-ink-600">Table view of every task in this board.</p>
      </div>

      <BoardToolbar
        tree={data}
        state={toolbar}
        onChange={setToolbar}
        visibleCount={rows.length}
        totalCount={data.tasks.length}
        onNewTask={(colId) => {
          setNewTaskCol(colId ?? null);
          setNewTaskOpen(true);
        }}
      />

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-ink-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
            <tr>
              <Th width="w-28" onClick={() => toggle("title")} sort={sort} dir={dir} k="title">
                Key
              </Th>
              <Th onClick={() => toggle("title")} sort={sort} dir={dir} k="title">
                Title
              </Th>
              <Th onClick={() => toggle("column")} sort={sort} dir={dir} k="column">
                Status
              </Th>
              <Th onClick={() => toggle("priority")} sort={sort} dir={dir} k="priority">
                Priority
              </Th>
              <Th onClick={() => toggle("assignee")} sort={sort} dir={dir} k="assignee">
                Assignee
              </Th>
              <Th onClick={() => toggle("reporter")} sort={sort} dir={dir} k="reporter">
                Reporter
              </Th>
              <Th onClick={() => toggle("estimate")} sort={sort} dir={dir} k="estimate">
                Est
              </Th>
              <Th onClick={() => toggle("start")} sort={sort} dir={dir} k="start">
                Start
              </Th>
              <Th onClick={() => toggle("due")} sort={sort} dir={dir} k="due">
                Due
              </Th>
              <th className="border-b border-ink-200 px-3 py-2">Labels</th>
              <Th onClick={() => toggle("created")} sort={sort} dir={dir} k="created">
                Created
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const col = colById.get(t.column_id);
              const overdue =
                t.due_at && !t.completed_at && new Date(t.due_at) < new Date();
              const assignee = t.assignee_id ? userById.get(t.assignee_id) : undefined;
              const reporter = userById.get(t.reporter_id);
              return (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="cursor-pointer border-t hover:bg-brand-50/40"
                >
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 font-mono text-[11.5px] font-semibold text-ink-600">
                    {t.key}
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    <div className="flex items-center gap-2">
                      {t.is_epic && (
                        <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-purple-600 text-white">
                          <IconEpic size={11} strokeWidth={2.25} />
                        </span>
                      )}
                      <span className="font-medium text-ink-900">{t.title}</span>
                      {t.completed_at && <Badge tone="green">Done</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-xs text-ink-700">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          col?.type === "done"
                            ? "bg-success-500"
                            : col?.type === "in_progress"
                            ? "bg-brand-500"
                            : "bg-ink-400"
                        }`}
                      />
                      {col?.name ?? "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2">
                    <PriorityIcon priority={t.priority} size={14} withLabel />
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2 text-ink-700">
                    {assignee ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={assignee.name} seed={assignee.id} size={20} />
                        <span className="truncate">{assignee.name}</span>
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2 text-ink-700">
                    {reporter ? (
                      <span className="inline-flex items-center gap-2">
                        <Avatar name={reporter.name} seed={reporter.id} size={20} />
                        <span className="truncate">{reporter.name}</span>
                      </span>
                    ) : (
                      <span className="text-ink-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-700">
                    {t.estimate_hours != null ? `${t.estimate_hours}h` : ""}
                  </td>
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-700">
                    {t.start_at && (
                      <span className="inline-flex items-center gap-1">
                        <IconCalendar size={12} />
                        {new Date(t.start_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td
                    className={`whitespace-nowrap border-b border-ink-100 px-3 py-2 ${
                      overdue ? "font-semibold text-danger-600" : "text-ink-700"
                    }`}
                  >
                    {t.due_at && (
                      <span className="inline-flex items-center gap-1">
                        <IconCalendar size={12} />
                        {new Date(t.due_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  <td className="border-b border-ink-100 px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.label_ids.map((id) => {
                        const l = labelById.get(id);
                        if (!l) return null;
                        return <LabelPill key={id} name={l.name} color={l.color} />;
                      })}
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-16 text-center text-sm text-ink-500">
                  No tasks match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {newTaskOpen && (
        <NewTaskModal
          tree={data}
          defaultColumnId={newTaskCol ?? undefined}
          onClose={() => {
            setNewTaskOpen(false);
            setNewTaskCol(null);
          }}
        />
      )}
      {selected && (
        <TaskDrawer
          task={data.tasks.find((t) => t.id === selected.id) ?? selected}
          tree={data}
          teamId={data.board.team_id}
          onClose={() => setSelected(null)}
        />
      )}
    </AppShell>
  );
}

function Th({
  children,
  onClick,
  sort,
  dir,
  k,
  width = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  sort: SortKey;
  dir: "asc" | "desc";
  k: SortKey;
  width?: string;
}) {
  const active = sort === k;
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none whitespace-nowrap border-b border-ink-200 px-3 py-2 ${width} hover:text-ink-900`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {active &&
          (dir === "asc" ? (
            <IconArrowUp size={10} strokeWidth={2.5} />
          ) : (
            <IconArrowDown size={10} strokeWidth={2.5} />
          ))}
      </span>
    </th>
  );
}
