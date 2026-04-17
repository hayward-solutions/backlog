"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { TaskDrawer } from "@/components/board/TaskDrawer";
import {
  api,
  BoardTree,
  MyTasksResponse,
  MyTasksInclude,
  Task,
  User,
} from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, LabelPill } from "@/components/ui/Badge";
import { PriorityIcon } from "@/components/ui/PriorityIcon";
import { Select } from "@/components/ui/Input";
import {
  IconArrowDown,
  IconArrowUp,
  IconBoard,
  IconCalendar,
  IconCheck,
  IconEpic,
  IconFilter,
  IconList,
  IconSearch,
} from "@/components/ui/icons";

type SortKey =
  | "priority"
  | "due"
  | "start"
  | "team"
  | "board"
  | "status"
  | "title"
  | "created";

type StatusFilter = "all" | "open" | "done";

const priorityRank: Record<string, number> = {
  low: 0,
  med: 1,
  high: 2,
  urgent: 3,
};

export default function MyTasksPage() {
  // Bucket toggles. Assigned is on by default so the bare URL shows
  // something useful; the other two are opt-in because they broaden scope.
  const [includeAssigned, setIncludeAssigned] = useState(true);
  const [includeUnassigned, setIncludeUnassigned] = useState(false);
  const [includeReported, setIncludeReported] = useState(false);

  const [status, setStatus] = useState<StatusFilter>("open");
  const [priority, setPriority] = useState<string>("");
  const [teamId, setTeamId] = useState<string>("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("priority");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  // Row click opens the TaskDrawer inline on this page rather than
  // navigating to the board — it keeps the caller's context (filters,
  // scroll position) so they can triage through a list without
  // bouncing between pages.
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);
  const qc = useQueryClient();

  const includeParam = useMemo(() => {
    const parts: MyTasksInclude[] = [];
    if (includeAssigned) parts.push("assigned");
    if (includeUnassigned) parts.push("unassigned");
    if (includeReported) parts.push("reported");
    // Server defaults to "assigned" if the param is empty; we send an
    // explicit sentinel so the server can return zero rows when the user
    // has deliberately toggled every bucket off.
    return parts.length > 0 ? parts.join(",") : "none";
  }, [includeAssigned, includeUnassigned, includeReported]);

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });

  const query = useQuery({
    queryKey: ["my-tasks", includeParam],
    queryFn: () =>
      api<MyTasksResponse>(`/me/tasks?include=${encodeURIComponent(includeParam)}`),
    // My tasks isn't real-time — relying on window focus is plenty for the
    // signal users actually care about ("what's on my plate") without thrashing.
    refetchOnWindowFocus: true,
  });

  // When a row is clicked we need the full BoardTree for the task's
  // board — TaskDrawer reads columns, labels and epics off it. Keyed the
  // same way as the board page so invalidations from the drawer
  // transparently refresh both views.
  const treeQuery = useQuery({
    enabled: !!selectedBoardId,
    queryKey: ["board", selectedBoardId],
    queryFn: () => api<BoardTree>(`/boards/${selectedBoardId}`),
  });

  const data = query.data;
  const myId = me.data?.id ?? "";

  const boardById = useMemo(() => {
    const m = new Map<string, MyTasksResponse["boards"][number]>();
    data?.boards.forEach((b) => m.set(b.id, b));
    return m;
  }, [data]);
  const columnById = useMemo(() => {
    const m = new Map<string, MyTasksResponse["columns"][number]>();
    data?.columns.forEach((c) => m.set(c.id, c));
    return m;
  }, [data]);
  const teamById = useMemo(() => {
    const m = new Map<string, MyTasksResponse["teams"][number]>();
    data?.teams.forEach((t) => m.set(t.id, t));
    return m;
  }, [data]);
  const userById = useMemo(() => {
    const m = new Map<string, MyTasksResponse["users"][number]>();
    data?.users.forEach((u) => m.set(u.id, u));
    return m;
  }, [data]);
  const labelById = useMemo(() => {
    const m = new Map<string, MyTasksResponse["labels"][number]>();
    data?.labels.forEach((l) => m.set(l.id, l));
    return m;
  }, [data]);

  // Team filter options are derived from the data so users can only filter
  // to teams that actually appear in the result set.
  const teamOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set(data.tasks.map((t) => boardById.get(t.board_id)?.team_id).filter(Boolean) as string[]);
    return Array.from(ids)
      .map((id) => teamById.get(id))
      .filter(Boolean)
      .sort((a, b) => a!.name.localeCompare(b!.name)) as MyTasksResponse["teams"];
  }, [data, boardById, teamById]);

  const rows = useMemo(() => {
    if (!data) return [] as Task[];
    const needle = q.trim().toLowerCase();
    const filtered = data.tasks.filter((t) => {
      if (status === "open" && t.completed_at) return false;
      if (status === "done" && !t.completed_at) return false;
      if (priority && t.priority !== priority) return false;
      if (teamId && boardById.get(t.board_id)?.team_id !== teamId) return false;
      if (needle) {
        const board = boardById.get(t.board_id);
        const hay = `${t.title} ${t.key} ${board?.name ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    const mult = dir === "asc" ? 1 : -1;
    const cmp = (a: Task, b: Task): number => {
      switch (sort) {
        case "priority":
          return (priorityRank[a.priority] - priorityRank[b.priority]) * mult;
        case "due": {
          const av = a.due_at ? new Date(a.due_at).getTime() : Infinity;
          const bv = b.due_at ? new Date(b.due_at).getTime() : Infinity;
          // Infinity always sorts last, independent of asc/desc.
          if (av === Infinity && bv === Infinity) return 0;
          if (av === Infinity) return 1;
          if (bv === Infinity) return -1;
          return (av - bv) * mult;
        }
        case "start": {
          const av = a.start_at ? new Date(a.start_at).getTime() : Infinity;
          const bv = b.start_at ? new Date(b.start_at).getTime() : Infinity;
          if (av === Infinity && bv === Infinity) return 0;
          if (av === Infinity) return 1;
          if (bv === Infinity) return -1;
          return (av - bv) * mult;
        }
        case "team": {
          const an = teamById.get(boardById.get(a.board_id)?.team_id ?? "")?.name ?? "";
          const bn = teamById.get(boardById.get(b.board_id)?.team_id ?? "")?.name ?? "";
          return an.localeCompare(bn) * mult;
        }
        case "board": {
          const an = boardById.get(a.board_id)?.name ?? "";
          const bn = boardById.get(b.board_id)?.name ?? "";
          return an.localeCompare(bn) * mult;
        }
        case "status": {
          const an = columnById.get(a.column_id)?.name ?? "";
          const bn = columnById.get(b.column_id)?.name ?? "";
          return an.localeCompare(bn) * mult;
        }
        case "title":
          return a.title.localeCompare(b.title) * mult;
        case "created":
          return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * mult;
      }
    };
    return [...filtered].sort(cmp);
  }, [data, q, status, priority, teamId, sort, dir, boardById, columnById, teamById]);

  function toggle(k: SortKey) {
    if (sort === k) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(k);
      setDir("asc");
    }
  }

  return (
    <AppShell
      topSlot={
        <Breadcrumbs items={[{ label: "My tasks" }]} />
      }
    >
      <div className="border-b border-ink-200 bg-ink-0 px-4 py-4 sm:px-6">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-ink-900">
          <IconList size={18} className="text-ink-500" /> My tasks
        </h1>
        <p className="text-sm text-ink-600">
          Tasks assigned to you across every team you&apos;re a member of.
          Toggle the extra buckets below to include unassigned work you could
          pick up, or items you reported.
        </p>
      </div>

      {/* Bucket toggles — these drive the server query, so count + refetch
          move together when the user changes them. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-0 px-3 py-2.5 sm:px-6">
        <BucketToggle
          label="Assigned to me"
          checked={includeAssigned}
          onChange={setIncludeAssigned}
          count={
            includeAssigned && data && myId
              ? data.tasks.filter((t) => t.assignee_id === myId).length
              : undefined
          }
        />
        <BucketToggle
          label="Unassigned"
          checked={includeUnassigned}
          onChange={setIncludeUnassigned}
          count={
            includeUnassigned && data
              ? data.tasks.filter((t) => !t.assignee_id).length
              : undefined
          }
          hint="On your teams — available to pick up."
        />
        <BucketToggle
          label="Reported by me"
          checked={includeReported}
          onChange={setIncludeReported}
          count={
            includeReported && data && myId
              ? data.tasks.filter((t) => t.reporter_id === myId).length
              : undefined
          }
        />
      </div>

      {/* View filters — apply client-side to whatever the server returned. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-0 px-3 py-2.5 sm:px-6">
        <div className="relative order-1 min-w-0 flex-1 sm:flex-initial">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500">
            <IconSearch size={14} />
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title, key, or board…"
            className="control w-full pl-8 sm:w-64"
          />
        </div>

        <div className="order-2 hidden items-center gap-1 border-l border-ink-200 pl-2 sm:flex">
          <span className="text-ink-500">
            <IconFilter size={14} />
          </span>
        </div>

        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusFilter)}
          title="Status"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="done">Done</option>
        </Select>

        <Select
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          title="Priority"
        >
          <option value="">Any priority</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="med">Medium</option>
          <option value="low">Low</option>
        </Select>

        {teamOptions.length > 1 && (
          <Select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            title="Team"
          >
            <option value="">Any team</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        )}

        {data && (
          <span className="ml-auto text-xs text-ink-500">
            {rows.length === data.tasks.length
              ? `${data.tasks.length} item${data.tasks.length === 1 ? "" : "s"}`
              : `${rows.length} of ${data.tasks.length}`}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-ink-0">
        {query.isLoading && (
          <p className="px-6 py-8 text-sm text-ink-500">Loading your tasks…</p>
        )}
        {query.error && (
          <p className="px-6 py-8 text-sm text-danger-600">
            {(query.error as Error).message}
          </p>
        )}

        {data && (
          <table className="w-full min-w-[1200px] border-separate border-spacing-0 text-sm">
            <thead className="sticky top-0 z-10 bg-ink-50 text-left text-[10.5px] font-semibold uppercase tracking-wider text-ink-600">
              <tr>
                <Th width="w-28" onClick={() => toggle("title")} sort={sort} dir={dir} k="title">
                  Key
                </Th>
                <Th onClick={() => toggle("title")} sort={sort} dir={dir} k="title">
                  Title
                </Th>
                <Th onClick={() => toggle("team")} sort={sort} dir={dir} k="team">
                  Team
                </Th>
                <Th onClick={() => toggle("board")} sort={sort} dir={dir} k="board">
                  Board
                </Th>
                <Th onClick={() => toggle("status")} sort={sort} dir={dir} k="status">
                  Status
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
                <th className="border-b border-ink-200 px-3 py-2">Labels</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const board = boardById.get(t.board_id);
                const col = columnById.get(t.column_id);
                const team = board ? teamById.get(board.team_id) : undefined;
                const assignee = t.assignee_id ? userById.get(t.assignee_id) : undefined;
                const reporter = userById.get(t.reporter_id);
                const overdue =
                  t.due_at && !t.completed_at && new Date(t.due_at) < new Date();
                const openTask = () => {
                  setSelectedBoardId(t.board_id);
                  setSelectedTaskId(t.id);
                };
                return (
                  <tr key={t.id} className="border-t hover:bg-brand-50/40">
                    <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 font-mono text-[11.5px] font-semibold text-ink-600">
                      <button
                        type="button"
                        onClick={openTask}
                        className="hover:underline"
                      >
                        {t.key}
                      </button>
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2">
                      <button
                        type="button"
                        onClick={openTask}
                        className="flex items-center gap-2 text-left"
                      >
                        {t.is_epic && (
                          <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-purple-600 text-white">
                            <IconEpic size={11} strokeWidth={2.25} />
                          </span>
                        )}
                        <span className="font-medium text-ink-900 hover:underline">
                          {t.title}
                        </span>
                        {t.completed_at && <Badge tone="green">Done</Badge>}
                      </button>
                    </td>
                    <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-700">
                      {team ? (
                        <Link
                          href={`/teams/${team.id}`}
                          className="inline-flex items-center gap-2 hover:underline"
                        >
                          <Avatar name={team.name} seed={team.id} size={18} />
                          <span className="truncate">{team.name}</span>
                        </Link>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-ink-100 px-3 py-2 text-ink-700">
                      {board ? (
                        <Link
                          href={`/boards/${board.id}`}
                          className="inline-flex items-center gap-1.5 hover:underline"
                        >
                          <IconBoard size={13} className="text-ink-500" />
                          <span className="truncate">{board.name}</span>
                        </Link>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
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
                          <Avatar
                            name={assignee.display_name || assignee.email}
                            seed={assignee.id}
                            size={20}
                          />
                          <span className="truncate">
                            {assignee.display_name || assignee.email}
                          </span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="border-b border-ink-100 px-3 py-2 text-ink-700">
                      {reporter ? (
                        <span className="inline-flex items-center gap-2">
                          <Avatar
                            name={reporter.display_name || reporter.email}
                            seed={reporter.id}
                            size={20}
                          />
                          <span className="truncate">
                            {reporter.display_name || reporter.email}
                          </span>
                        </span>
                      ) : (
                        <span className="text-ink-400">—</span>
                      )}
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
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-16 text-center text-sm text-ink-500">
                    {data.tasks.length === 0
                      ? "Nothing on your plate right now — enjoy the quiet."
                      : "No tasks match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {selectedTaskId &&
        treeQuery.data &&
        (() => {
          // Pull the task from the freshly fetched board so drawer edits
          // reflect the latest state. If the task was moved away (e.g. to
          // another board) fall back to whatever we have in the list data.
          const taskFromTree = treeQuery.data.tasks.find(
            (x) => x.id === selectedTaskId
          );
          const taskFromList = data?.tasks.find((x) => x.id === selectedTaskId);
          const task = taskFromTree ?? taskFromList;
          if (!task) return null;
          return (
            <TaskDrawer
              task={task}
              tree={treeQuery.data}
              teamId={treeQuery.data.board.team_id}
              onClose={() => {
                setSelectedTaskId(null);
                setSelectedBoardId(null);
                // Drawer invalidates ["board", ...] — make sure the
                // aggregated list reflects any edits the user just made.
                qc.invalidateQueries({ queryKey: ["my-tasks"] });
              }}
            />
          );
        })()}
    </AppShell>
  );
}

function BucketToggle({
  label,
  checked,
  onChange,
  count,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  count?: number;
  hint?: string;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-sm transition ${
        checked
          ? "border-brand-300 bg-brand-50 text-brand-800"
          : "border-ink-200 bg-ink-0 text-ink-700 hover:bg-ink-100"
      }`}
      title={hint}
    >
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-[4px] border ${
          checked
            ? "border-brand-500 bg-brand-500 text-white"
            : "border-ink-300 bg-ink-0 text-transparent"
        }`}
      >
        <IconCheck size={11} strokeWidth={3} />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="font-medium">{label}</span>
      {typeof count === "number" && checked && (
        <span className="rounded-full bg-ink-0/70 px-1.5 text-[11px] font-semibold text-brand-700">
          {count}
        </span>
      )}
    </label>
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
