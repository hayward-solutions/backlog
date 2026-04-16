"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { NewTaskModal } from "@/components/board/NewTaskModal";
import { TaskDrawer } from "@/components/board/TaskDrawer";
import { api, BoardTree, Member, Task } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, LabelPill } from "@/components/ui/Badge";
import { PriorityIcon } from "@/components/ui/PriorityIcon";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronRight,
  IconEpic,
  IconPlus,
} from "@/components/ui/icons";

type SortKey = "title" | "progress" | "start" | "due" | "priority" | "created";

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
    const m = new Map<string, { id: string; name: string }>();
    members.data?.forEach((mem) =>
      m.set(mem.user.id, { id: mem.user.id, name: mem.user.display_name || mem.user.email })
    );
    return m;
  }, [members.data]);

  const colById = useMemo(() => {
    const m = new Map<string, { name: string; type: string }>();
    tree.data?.columns.forEach((c) => m.set(c.id, { name: c.name, type: c.type }));
    return m;
  }, [tree.data]);

  const labelById = useMemo(() => {
    const m = new Map<string, { name: string; color: string }>();
    tree.data?.labels.forEach((l) => m.set(l.id, { name: l.name, color: l.color }));
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
  }, [tree.data, labelFilter]);

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
        case "start": {
          const av = a.epic.start_at ? new Date(a.epic.start_at).getTime() : Infinity;
          const bv = b.epic.start_at ? new Date(b.epic.start_at).getTime() : Infinity;
          return (av - bv) * mult;
        }
        case "due": {
          const av = a.epic.due_at ? new Date(a.epic.due_at).getTime() : Infinity;
          const bv = b.epic.due_at ? new Date(b.epic.due_at).getTime() : Infinity;
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
  const toggleExpand = (id: string) =>
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <AppShell
      boardId={boardId}
      teamId={data.board.team_id}
      topSlot={
        <Breadcrumbs
          items={[
            { label: "Teams", href: "/teams" },
            { label: "Team", href: `/teams/${data.board.team_id}` },
            { label: data.board.name, href: `/boards/${boardId}` },
            { label: "Epics" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
              Epics
            </h1>
            <p className="text-sm text-ink-600">
              Group tasks under larger goals and track progress.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              setNewTaskEpicDefault(null);
              setNewTaskOpen(true);
            }}
          >
            <IconPlus size={14} strokeWidth={2.25} />
            New epic
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-ink-200 bg-white px-4 py-2.5 sm:px-6">
        {data.labels.length > 0 && (
          <Select
            value={labelFilter}
            onChange={(e) => setLabelFilter(e.target.value)}
            title="Label"
          >
            <option value="">Any label</option>
            <option value="none">No labels</option>
            {data.labels.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        )}
        <span className="text-xs text-ink-500">
          {sortedRows.length} {sortedRows.length === 1 ? "epic" : "epics"}
        </span>
      </div>

      <div className="flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1000px] border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-ink-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
            <tr>
              <th className="w-8 border-b border-ink-200 px-2 py-2"></th>
              <Th onClick={() => toggle("title")} sort={sort} dir={dir} k="title">
                Epic
              </Th>
              <Th onClick={() => toggle("progress")} sort={sort} dir={dir} k="progress">
                Progress
              </Th>
              <Th onClick={() => toggle("priority")} sort={sort} dir={dir} k="priority">
                Priority
              </Th>
              <th className="border-b border-ink-200 px-3 py-2">Assignee</th>
              <th className="border-b border-ink-200 px-3 py-2">Reporter</th>
              <Th onClick={() => toggle("start")} sort={sort} dir={dir} k="start">
                Start
              </Th>
              <Th onClick={() => toggle("due")} sort={sort} dir={dir} k="due">
                Due
              </Th>
              <Th onClick={() => toggle("created")} sort={sort} dir={dir} k="created">
                Created
              </Th>
              <th className="border-b border-ink-200 px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(({ epic, children, done, total, pct }) => {
              const isOpen = expanded.has(epic.id);
              const overdue =
                epic.due_at &&
                !epic.completed_at &&
                new Date(epic.due_at) < new Date();
              const assignee = epic.assignee_id
                ? userById.get(epic.assignee_id)
                : undefined;
              const reporter = userById.get(epic.reporter_id);
              return (
                <Fragment key={epic.id}>
                  <tr className="border-t transition hover:bg-brand-50/40">
                    <td
                      className="border-b border-ink-100 px-2 py-2 text-center text-ink-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (total > 0) toggleExpand(epic.id);
                      }}
                    >
                      {total > 0 && (
                        <button
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md hover:bg-ink-100"
                          aria-label={isOpen ? "Collapse" : "Expand"}
                        >
                          {isOpen ? (
                            <IconChevronDown size={14} strokeWidth={2} />
                          ) : (
                            <IconChevronRight size={14} strokeWidth={2} />
                          )}
                        </button>
                      )}
                    </td>
                    <td
                      className="cursor-pointer border-b border-ink-100 px-3 py-2"
                      onClick={() => setSelected(epic)}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-purple-600 text-white">
                          <IconEpic size={12} strokeWidth={2.25} />
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-ink-500">
                          {epic.key}
                        </span>
                        <span className="font-semibold text-ink-900">{epic.title}</span>
                        {epic.completed_at && <Badge tone="green">Done</Badge>}
                        {epic.label_ids.map((id) => {
                          const l = labelById.get(id);
                          if (!l) return null;
                          return <LabelPill key={id} name={l.name} color={l.color} />;
                        })}
                      </div>
                    </td>
                    <td
                      className="cursor-pointer border-b border-ink-100 px-3 py-2"
                      onClick={() => setSelected(epic)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-28 overflow-hidden rounded-full bg-ink-100">
                          <div
                            className={`h-full rounded-full transition-all ${
                              pct === 100
                                ? "bg-success-500"
                                : pct > 0
                                ? "bg-brand-500"
                                : "bg-ink-300"
                            }`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="whitespace-nowrap text-xs font-medium text-ink-700">
                          {done}/{total} · {pct}%
                        </span>
                      </div>
                    </td>
                    <td
                      className="cursor-pointer whitespace-nowrap border-b border-ink-100 px-3 py-2"
                      onClick={() => setSelected(epic)}
                    >
                      <PriorityIcon priority={epic.priority} size={14} withLabel />
                    </td>
                    <td
                      className="cursor-pointer border-b border-ink-100 px-3 py-2 text-ink-700"
                      onClick={() => setSelected(epic)}
                    >
                      {assignee ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={assignee.name} seed={assignee.id} size={20} />
                          <span className="truncate">{assignee.name}</span>
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td
                      className="cursor-pointer border-b border-ink-100 px-3 py-2 text-ink-700"
                      onClick={() => setSelected(epic)}
                    >
                      {reporter ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={reporter.name} seed={reporter.id} size={20} />
                          <span className="truncate">{reporter.name}</span>
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td
                      className="cursor-pointer whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-700"
                      onClick={() => setSelected(epic)}
                    >
                      {epic.start_at
                        ? new Date(epic.start_at).toLocaleDateString()
                        : ""}
                    </td>
                    <td
                      className={`cursor-pointer whitespace-nowrap border-b border-ink-100 px-3 py-2 ${
                        overdue ? "font-semibold text-danger-600" : "text-ink-700"
                      }`}
                      onClick={() => setSelected(epic)}
                    >
                      {epic.due_at
                        ? new Date(epic.due_at).toLocaleDateString()
                        : ""}
                    </td>
                    <td
                      className="cursor-pointer whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-500"
                      onClick={() => setSelected(epic)}
                    >
                      {new Date(epic.created_at).toLocaleDateString()}
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setNewTaskEpicDefault(epic.id);
                          setNewTaskOpen(true);
                        }}
                        className="btn btn-ghost btn-sm"
                      >
                        <IconPlus size={12} strokeWidth={2.25} /> Task
                      </button>
                    </td>
                  </tr>
                  {isOpen &&
                    children.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelected(c)}
                        className="cursor-pointer border-t bg-ink-50/60 hover:bg-ink-100/70"
                      >
                        <td className="border-b border-ink-100"></td>
                        <td className="border-b border-ink-100 px-3 py-1.5 pl-8">
                          <div className="flex items-center gap-2">
                            <span className="text-ink-400">↳</span>
                            <span className="font-mono text-[11px] font-semibold text-ink-500">
                              <span className="text-ink-400">{epic.key}</span>
                              <span className="mx-0.5 text-ink-300">/</span>
                              <span>{c.key}</span>
                            </span>
                            <span className="text-ink-800">{c.title}</span>
                            {c.completed_at && <Badge tone="green">Done</Badge>}
                          </div>
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5 text-xs text-ink-500">
                          {colById.get(c.column_id)?.name ?? "—"}
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5">
                          <PriorityIcon priority={c.priority} size={13} />
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5 text-ink-700">
                          {c.assignee_id ? (
                            <Avatar
                              name={userById.get(c.assignee_id)?.name ?? "?"}
                              seed={c.assignee_id}
                              size={18}
                            />
                          ) : (
                            <span className="text-ink-400">—</span>
                          )}
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5 text-ink-700">
                          <Avatar
                            name={userById.get(c.reporter_id)?.name ?? "?"}
                            seed={c.reporter_id}
                            size={18}
                          />
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5 text-xs text-ink-600">
                          {c.start_at
                            ? new Date(c.start_at).toLocaleDateString()
                            : ""}
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5 text-xs text-ink-600">
                          {c.due_at
                            ? new Date(c.due_at).toLocaleDateString()
                            : ""}
                        </td>
                        <td className="border-b border-ink-100 px-3 py-1.5 text-xs text-ink-500">
                          {new Date(c.created_at).toLocaleDateString()}
                        </td>
                        <td className="border-b border-ink-100"></td>
                      </tr>
                    ))}
                  {isOpen && children.length === 0 && (
                    <tr className="border-t bg-ink-50/60">
                      <td className="border-b border-ink-100"></td>
                      <td
                        colSpan={9}
                        className="border-b border-ink-100 px-3 py-2 pl-8 text-xs text-ink-500"
                      >
                        No tasks in this epic yet.
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-16 text-center text-sm text-ink-500">
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
    </AppShell>
  );
}

function Th({
  children,
  onClick,
  sort,
  dir,
  k,
}: {
  children: React.ReactNode;
  onClick: () => void;
  sort: SortKey;
  dir: "asc" | "desc";
  k: SortKey;
}) {
  const active = sort === k;
  return (
    <th
      onClick={onClick}
      className="cursor-pointer select-none whitespace-nowrap border-b border-ink-200 px-3 py-2 hover:text-ink-900"
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
