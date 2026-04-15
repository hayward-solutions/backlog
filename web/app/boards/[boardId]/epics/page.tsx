"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";

import { Nav } from "@/components/Nav";
import { NewTaskModal } from "@/components/board/NewTaskModal";
import { TaskDrawer } from "@/components/board/TaskDrawer";
import { api, BoardTree, canManageBoards, Member, Task } from "@/lib/api";

type SortKey = "title" | "progress" | "deadline" | "priority" | "created";

const priorityRank: Record<string, number> = { low: 0, med: 1, high: 2, urgent: 3 };

export default function BoardEpicsPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [selected, setSelected] = useState<Task | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskEpicDefault, setNewTaskEpicDefault] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [labelFilter, setLabelFilter] = useState<string>("");

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

  const userById = useMemo(() => {
    const m = new Map<string, string>();
    members.data?.forEach((mem) => m.set(mem.user.id, mem.user.display_name));
    return m;
  }, [members.data]);

  const colById = useMemo(() => {
    const m = new Map<string, { name: string; type: string }>();
    tree.data?.columns.forEach((c) => m.set(c.id, { name: c.name, type: c.type }));
    return m;
  }, [tree.data]);

  const epicsWithStats = useMemo(() => {
    const tasks = tree.data?.tasks ?? [];
    let epics = tasks.filter((t) => t.is_epic);
    if (labelFilter === "none") {
      epics = epics.filter((e) => e.label_ids.length === 0);
    } else if (labelFilter) {
      epics = epics.filter((e) => e.label_ids.includes(labelFilter));
    }
    return epics.map((e) => {
      const children = tasks.filter((t) => t.epic_id === e.id);
      const done = children.filter((t) => t.completed_at).length;
      const pct = children.length === 0 ? 0 : Math.round((done / children.length) * 100);
      return { epic: e, children, done, total: children.length, pct };
    });
  }, [tree.data]);

  const sortedRows = useMemo(() => {
    const mult = dir === "asc" ? 1 : -1;
    const cmp = (
      a: (typeof epicsWithStats)[number],
      b: (typeof epicsWithStats)[number]
    ): number => {
      switch (sort) {
        case "title":
          return a.epic.title.localeCompare(b.epic.title) * mult;
        case "progress":
          return (a.pct - b.pct) * mult;
        case "priority":
          return (priorityRank[a.epic.priority] - priorityRank[b.epic.priority]) * mult;
        case "deadline": {
          const av = a.epic.deadline_at ? new Date(a.epic.deadline_at).getTime() : Infinity;
          const bv = b.epic.deadline_at ? new Date(b.epic.deadline_at).getTime() : Infinity;
          return (av - bv) * mult;
        }
        case "created":
          return (
            (new Date(a.epic.created_at).getTime() -
              new Date(b.epic.created_at).getTime()) *
            mult
          );
      }
    };
    return [...epicsWithStats].sort(cmp);
  }, [epicsWithStats, sort, dir]);

  const labelById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    tree.data?.labels.forEach((l) => m.set(l.id, { name: l.name, color: l.color }));
    return m;
  }, [tree.data]);

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
  const toggleExpand = (id: string) =>
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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
              <Link
                href={`/boards/${boardId}/tasks`}
                className="text-neutral-500 hover:underline"
              >
                Tasks
              </Link>
              <span className="font-medium">Epics</span>
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

      <div className="flex items-center gap-3 border-b bg-neutral-50 px-6 py-2 text-sm">
        {data.labels.length > 0 && (
          <select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            className="rounded border border-neutral-300 px-2 py-1"
            title="Label"
          >
            <option value="">Label: any</option>
            <option value="none">No labels</option>
            {data.labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <span className="text-neutral-500">
          {sortedRows.length} {sortedRows.length === 1 ? "epic" : "epics"}
        </span>
        <span className="ml-auto" />
        <button
          type="button"
          onClick={() => {
            setNewTaskEpicDefault(null);
            setNewTaskOpen(true);
          }}
          className="rounded bg-neutral-900 px-3 py-1 text-white"
        >
          + New epic
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-100 text-left text-xs uppercase text-neutral-600">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <Th onClick={() => toggle("title")}>Title{arrow("title")}</Th>
              <Th onClick={() => toggle("progress")}>Progress{arrow("progress")}</Th>
              <Th onClick={() => toggle("priority")}>Priority{arrow("priority")}</Th>
              <th className="px-3 py-2">Assignee</th>
              <th className="px-3 py-2">Reporter</th>
              <Th onClick={() => toggle("deadline")}>Deadline{arrow("deadline")}</Th>
              <Th onClick={() => toggle("created")}>Created{arrow("created")}</Th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ epic, children, done, total, pct }) => {
              const isOpen = expanded.has(epic.id);
              const overdue =
                epic.deadline_at &&
                !epic.completed_at &&
                new Date(epic.deadline_at) < new Date();
              return (
                <Fragment key={epic.id}>
                  <tr className="cursor-pointer border-t hover:bg-neutral-50">
                    <td
                      className="px-3 py-2 text-neutral-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (total > 0) toggleExpand(epic.id);
                      }}
                    >
                      {total > 0 ? (isOpen ? "▾" : "▸") : ""}
                    </td>
                    <td className="px-3 py-2" onClick={() => setSelected(epic)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{epic.title}</span>
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] text-purple-700">
                          epic
                        </span>
                        {epic.completed_at && (
                          <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                            done
                          </span>
                        )}
                        {epic.label_ids.map((id) => {
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
                    <td className="px-3 py-2" onClick={() => setSelected(epic)}>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded bg-neutral-200">
                          <div
                            className="h-full bg-emerald-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-neutral-600">
                          {done}/{total} · {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2" onClick={() => setSelected(epic)}>
                      {epic.priority}
                    </td>
                    <td
                      className="px-3 py-2 text-neutral-600"
                      onClick={() => setSelected(epic)}
                    >
                      {epic.assignee_id ? userById.get(epic.assignee_id) ?? "—" : "—"}
                    </td>
                    <td
                      className="px-3 py-2 text-neutral-600"
                      onClick={() => setSelected(epic)}
                    >
                      {userById.get(epic.reporter_id) ?? "—"}
                    </td>
                    <td
                      className={`px-3 py-2 ${overdue ? "text-red-600 font-medium" : ""}`}
                      onClick={() => setSelected(epic)}
                    >
                      {epic.deadline_at
                        ? new Date(epic.deadline_at).toLocaleDateString()
                        : ""}
                    </td>
                    <td
                      className="px-3 py-2 text-neutral-500"
                      onClick={() => setSelected(epic)}
                    >
                      {new Date(epic.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewTaskEpicDefault(epic.id);
                          setNewTaskOpen(true);
                        }}
                        className="rounded border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
                      >
                        + Task
                      </button>
                    </td>
                  </tr>
                  {isOpen &&
                    children.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="cursor-pointer border-t bg-neutral-50 hover:bg-neutral-100"
                      >
                        <td></td>
                        <td className="px-3 py-1.5 pl-6 text-neutral-700">
                          <div className="flex items-center gap-2">
                            <span>↳ {c.title}</span>
                            {c.completed_at && (
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                                done
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-neutral-500">
                          {colById.get(c.column_id)?.name ?? "—"}
                        </td>
                        <td className="px-3 py-1.5">{c.priority}</td>
                        <td className="px-3 py-1.5 text-neutral-600">
                          {c.assignee_id ? userById.get(c.assignee_id) ?? "—" : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-600">
                          {userById.get(c.reporter_id) ?? "—"}
                        </td>
                        <td className="px-3 py-1.5">
                          {c.deadline_at
                            ? new Date(c.deadline_at).toLocaleDateString()
                            : ""}
                        </td>
                        <td className="px-3 py-1.5 text-neutral-500">
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  {isOpen && children.length === 0 && (
                    <tr className="border-t bg-neutral-50">
                      <td></td>
                      <td colSpan={8} className="px-3 py-2 pl-6 text-xs text-neutral-500">
                        No tasks in this epic.
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
                  No epics yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {newTaskOpen && (
        <NewTaskModal
          tree={data}
          defaultEpicId={newTaskEpicDefault ?? undefined}
          defaultIsEpic={newTaskEpicDefault === null}
          onClose={() => {
            setNewTaskOpen(false);
            setNewTaskEpicDefault(null);
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
