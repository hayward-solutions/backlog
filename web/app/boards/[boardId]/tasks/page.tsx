"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { Nav } from "@/components/Nav";
import { NewTaskModal } from "@/components/board/NewTaskModal";
import { TaskDrawer } from "@/components/board/TaskDrawer";
import {
  BoardToolbar,
  ToolbarState,
  defaultToolbarState,
  filterTasks,
} from "@/components/board/BoardToolbar";
import { api, BoardTree, canManageBoards, Member, Task } from "@/lib/api";

type SortKey =
  | "title"
  | "column"
  | "priority"
  | "assignee"
  | "reporter"
  | "deadline"
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
    const m = new Map<string, string>();
    members.data?.forEach((mem) => m.set(mem.user.id, mem.user.display_name));
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
          const an = a.assignee_id ? userById.get(a.assignee_id) ?? "" : "";
          const bn = b.assignee_id ? userById.get(b.assignee_id) ?? "" : "";
          return an.localeCompare(bn) * mult;
        }
        case "reporter": {
          const an = userById.get(a.reporter_id) ?? "";
          const bn = userById.get(b.reporter_id) ?? "";
          return an.localeCompare(bn) * mult;
        }
        case "deadline": {
          const av = a.deadline_at ? new Date(a.deadline_at).getTime() : Infinity;
          const bv = b.deadline_at ? new Date(b.deadline_at).getTime() : Infinity;
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
      <div>
        <Nav />
        <p className="p-6 text-neutral-500">Loading…</p>
      </div>
    );
  }
  if (tree.error) {
    return (
      <div>
        <Nav />
        <p className="p-6 text-red-600">{(tree.error as Error).message}</p>
      </div>
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
  const arrow = (k: SortKey) => (sort === k ? (dir === "asc" ? " ▲" : " ▼") : "");

  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <div className="border-b bg-white px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">{data.board.name}</h1>
            <nav className="mt-1 flex gap-4 text-sm">
              <Link href={`/boards/${boardId}`} className="text-neutral-500 hover:underline">
                Board
              </Link>
              <span className="font-medium">Tasks</span>
              <Link
                href={`/boards/${boardId}/epics`}
                className="text-neutral-500 hover:underline"
              >
                Epics
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {canManageBoards(data.your_role) && (
              <Link
                href={`/boards/${boardId}/settings`}
                className="text-neutral-600 hover:underline"
              >
                Settings
              </Link>
            )}
            <Link
              href={`/teams/${data.board.team_id}`}
              className="text-neutral-500 hover:underline"
            >
              ← back to team
            </Link>
          </div>
        </div>
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

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-100 text-left text-xs uppercase text-neutral-600">
            <tr>
              <Th onClick={() => toggle("title")}>Title{arrow("title")}</Th>
              <Th onClick={() => toggle("column")}>Column{arrow("column")}</Th>
              <Th onClick={() => toggle("priority")}>Priority{arrow("priority")}</Th>
              <Th onClick={() => toggle("assignee")}>Assignee{arrow("assignee")}</Th>
              <Th onClick={() => toggle("reporter")}>Reporter{arrow("reporter")}</Th>
              <Th onClick={() => toggle("estimate")}>Est{arrow("estimate")}</Th>
              <Th onClick={() => toggle("deadline")}>Deadline{arrow("deadline")}</Th>
              <th className="px-3 py-2">Labels</th>
              <Th onClick={() => toggle("created")}>Created{arrow("created")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const col = colById.get(t.column_id);
              const overdue =
                t.deadline_at && !t.completed_at && new Date(t.deadline_at) < new Date();
              return (
                <tr
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className="cursor-pointer border-t hover:bg-neutral-50"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span>{t.title}</span>
                      {t.is_epic && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">
                          epic
                        </span>
                      )}
                      {t.completed_at && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                          done
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{col?.name ?? "—"}</td>
                  <td className="px-3 py-2">{t.priority}</td>
                  <td className="px-3 py-2 text-neutral-600">
                    {t.assignee_id ? userById.get(t.assignee_id) ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2 text-neutral-600">
                    {userById.get(t.reporter_id) ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    {t.estimate_hours != null ? `${t.estimate_hours}h` : ""}
                  </td>
                  <td className={`px-3 py-2 ${overdue ? "text-red-600 font-medium" : ""}`}>
                    {t.deadline_at ? new Date(t.deadline_at).toLocaleDateString() : ""}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {t.label_ids.map((id) => {
                        const l = labelById.get(id);
                        if (!l) return null;
                        return (
                          <span
                            key={id}
                            className="rounded px-1.5 py-0.5 text-[10px] text-white"
                            style={{ background: l.color }}
                          >
                            {l.name}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
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
    </div>
  );
}

function Th({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none px-3 py-2 font-medium hover:text-neutral-900"
    >
      {children}
    </th>
  );
}
