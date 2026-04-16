"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { Button } from "@/components/ui/Button";
import { LabelPill } from "@/components/ui/Badge";
import { PriorityIcon } from "@/components/ui/PriorityIcon";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconEpic,
} from "@/components/ui/icons";

const DAY_WIDTH = 32;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 56;
const LEFT_COL_WIDTH = 260;

const priorityColor: Record<string, string> = {
  low: "#579DFF",
  med: "#B38600",
  high: "#E2483D",
  urgent: "#AE2A19",
};

// --- Date utilities ----------------------------------------------------------

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round(
    (startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000
  );
}

function sameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

// --- Page --------------------------------------------------------------------

type TimelineRow = {
  task: Task;
  depth: 0 | 1;
  parentKey?: string;
  hasChildren?: boolean;
  isExpanded?: boolean;
};

export default function BoardTimelinePage() {
  const { boardId } = useParams<{ boardId: string }>();
  const [toolbar, setToolbar] = useState<ToolbarState>(defaultToolbarState);
  const [selected, setSelected] = useState<Task | null>(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  // Epics start expanded so every matching task is visible by default.
  // Collapsing an epic hides its children from the timeline.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

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
      m.set(mem.user.id, {
        id: mem.user.id,
        name: mem.user.display_name || mem.user.email,
      })
    );
    return m;
  }, [members.data]);

  const filtered = useMemo(() => {
    const tasks = tree.data?.tasks ?? [];
    return filterTasks(tasks, toolbar);
  }, [tree.data, toolbar]);

  // Build the flattened row list: epics (with their children nested beneath
  // when expanded), followed by orphan tasks. Within each group, tasks sort by
  // their earliest-known date so unscheduled items naturally fall to the end.
  const rows = useMemo((): TimelineRow[] => {
    const keyOf = (t: Task) => {
      const s = t.start_at ? new Date(t.start_at).getTime() : Infinity;
      const d = t.due_at ? new Date(t.due_at).getTime() : Infinity;
      return Math.min(s, d);
    };
    const byDate = (a: Task, b: Task) => {
      const ak = keyOf(a);
      const bk = keyOf(b);
      if (ak !== bk) return ak - bk;
      return a.title.localeCompare(b.title);
    };

    const epicIds = new Set(
      filtered.filter((t) => t.is_epic).map((t) => t.id)
    );
    const childrenByEpic = new Map<string, Task[]>();
    const orphans: Task[] = [];
    const epics: Task[] = [];
    for (const t of filtered) {
      if (t.is_epic) {
        epics.push(t);
      } else if (t.epic_id && epicIds.has(t.epic_id)) {
        const arr = childrenByEpic.get(t.epic_id) ?? [];
        arr.push(t);
        childrenByEpic.set(t.epic_id, arr);
      } else {
        orphans.push(t);
      }
    }

    const out: TimelineRow[] = [];
    for (const epic of [...epics].sort(byDate)) {
      const kids = (childrenByEpic.get(epic.id) ?? []).sort(byDate);
      const isExpanded = !collapsed.has(epic.id);
      out.push({
        task: epic,
        depth: 0,
        hasChildren: kids.length > 0,
        isExpanded,
      });
      if (isExpanded) {
        for (const c of kids) {
          out.push({ task: c, depth: 1, parentKey: epic.key });
        }
      }
    }
    for (const o of [...orphans].sort(byDate)) {
      out.push({ task: o, depth: 0 });
    }
    return out;
  }, [filtered, collapsed]);

  const toggleCollapsed = (epicId: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(epicId)) next.delete(epicId);
      else next.add(epicId);
      return next;
    });

  // Visible date range: pad around earliest/latest task dates and today.
  // Use the full filtered set (not just visible rows) so collapsing an epic
  // doesn't shift the timeline.
  const { rangeStart, totalDays } = useMemo(() => {
    const today = startOfDay(new Date());
    let minTs = addDays(today, -14).getTime();
    let maxTs = addDays(today, 28).getTime();
    for (const t of filtered) {
      if (t.start_at) {
        const v = startOfDay(new Date(t.start_at)).getTime();
        if (v < minTs) minTs = v;
        if (v > maxTs) maxTs = v;
      }
      if (t.due_at) {
        const v = startOfDay(new Date(t.due_at)).getTime();
        if (v < minTs) minTs = v;
        if (v > maxTs) maxTs = v;
      }
    }
    // Pad ±7 days around the data.
    const start = addDays(new Date(minTs), -7);
    const end = addDays(new Date(maxTs), 7);
    return {
      rangeStart: startOfDay(start),
      totalDays: Math.max(30, daysBetween(start, end) + 1),
    };
  }, [filtered]);

  const days = useMemo(
    () => Array.from({ length: totalDays }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, totalDays]
  );

  // Month header segments (start day index and span).
  const monthSegments = useMemo(() => {
    const segs: { label: string; start: number; span: number }[] = [];
    let cursor = 0;
    while (cursor < days.length) {
      const first = days[cursor];
      let span = 1;
      while (cursor + span < days.length && sameMonth(first, days[cursor + span])) {
        span++;
      }
      segs.push({
        label: first.toLocaleDateString(undefined, {
          month: "short",
          year: "numeric",
        }),
        start: cursor,
        span,
      });
      cursor += span;
    }
    return segs;
  }, [days]);

  const today = startOfDay(new Date());
  const todayOffset = daysBetween(rangeStart, today);

  // Scroll-to-today on first load (or when range changes).
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToToday = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const center = todayOffset * DAY_WIDTH - el.clientWidth / 2 + DAY_WIDTH / 2;
    el.scrollTo({ left: Math.max(0, center), behavior: "smooth" });
  }, [todayOffset]);

  // Only scroll on first layout; let the user scroll freely afterwards.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (!scrollRef.current || days.length === 0) return;
    const el = scrollRef.current;
    const center = todayOffset * DAY_WIDTH - el.clientWidth / 2 + DAY_WIDTH / 2;
    el.scrollLeft = Math.max(0, center);
    didInitialScroll.current = true;
  }, [days.length, todayOffset]);

  function shiftBy(dayDelta: number) {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dayDelta * DAY_WIDTH, behavior: "smooth" });
  }

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
  const gridWidth = totalDays * DAY_WIDTH;

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
            { label: "Timeline" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
              Timeline
            </h1>
            <p className="text-sm text-ink-600">
              Schedule work against start and due dates.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={() => shiftBy(-14)}>
              <IconChevronLeft size={14} strokeWidth={2.25} />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={scrollToToday}>
              Today
            </Button>
            <Button variant="secondary" size="sm" onClick={() => shiftBy(14)}>
              <span className="hidden sm:inline">Forward</span>
              <IconChevronRight size={14} strokeWidth={2.25} />
            </Button>
          </div>
        </div>
      </div>

      <BoardToolbar
        tree={data}
        state={toolbar}
        onChange={setToolbar}
        visibleCount={rows.length}
        totalCount={filtered.length}
        onNewTask={() => setNewTaskOpen(true)}
      />

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto bg-white"
        style={{ position: "relative" }}
      >
        <div
          className="relative"
          style={{ width: LEFT_COL_WIDTH + gridWidth, minHeight: "100%" }}
        >
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex border-b border-ink-200 bg-ink-50"
            style={{ height: HEADER_HEIGHT }}
          >
            <div
              className="sticky left-0 z-10 flex items-center border-r border-ink-200 bg-ink-50 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-600"
              style={{ width: LEFT_COL_WIDTH, minWidth: LEFT_COL_WIDTH }}
            >
              Task
            </div>
            <div
              className="relative"
              style={{ width: gridWidth, minWidth: gridWidth }}
            >
              {/* Month row */}
              <div className="flex h-[26px] border-b border-ink-200">
                {monthSegments.map((m) => (
                  <div
                    key={`${m.label}-${m.start}`}
                    className="flex items-center border-r border-ink-200 px-2 text-[11px] font-semibold text-ink-700"
                    style={{ width: m.span * DAY_WIDTH }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              {/* Day row */}
              <div className="flex h-[30px]">
                {days.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const isToday = i === todayOffset;
                  return (
                    <div
                      key={d.toISOString()}
                      className={`flex flex-col items-center justify-center border-r text-[10px] ${
                        isToday
                          ? "bg-brand-50 font-bold text-brand-700"
                          : isWeekend
                          ? "bg-ink-100 text-ink-500"
                          : "text-ink-600"
                      } border-ink-200`}
                      style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                    >
                      <span className="text-[9px] uppercase leading-none">
                        {d.toLocaleDateString(undefined, { weekday: "short" })[0]}
                      </span>
                      <span className="leading-tight">{d.getDate()}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rows */}
          {rows.length === 0 ? (
            <div
              className="flex items-center justify-center px-6 py-20 text-sm text-ink-500"
              style={{ minHeight: 200 }}
            >
              No tasks match the current filters.
            </div>
          ) : (
            <div className="relative">
              {/* Today vertical line spanning all rows */}
              {todayOffset >= 0 && todayOffset < totalDays && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-0 z-10 w-px bg-brand-500/70"
                  style={{
                    left: LEFT_COL_WIDTH + todayOffset * DAY_WIDTH + DAY_WIDTH / 2,
                    height: rows.length * ROW_HEIGHT,
                  }}
                />
              )}

              {rows.map((row) => {
                const t = row.task;
                const assignee = t.assignee_id
                  ? userById.get(t.assignee_id)
                  : undefined;
                const start = t.start_at ? startOfDay(new Date(t.start_at)) : null;
                const due = t.due_at ? startOfDay(new Date(t.due_at)) : null;
                const labels = (data.labels ?? []).filter((l) =>
                  t.label_ids.includes(l.id)
                );
                const color =
                  priorityColor[t.priority] ?? priorityColor.med;
                const barColor = t.completed_at ? "#16A34A" : color;
                const overdue =
                  due && !t.completed_at && due.getTime() < today.getTime();
                const isChild = row.depth === 1;

                return (
                  <div
                    key={t.id}
                    className={`flex border-b border-ink-100 ${
                      isChild ? "bg-ink-50/50" : "bg-white"
                    }`}
                    style={{ height: ROW_HEIGHT }}
                  >
                    {/* Left sticky label */}
                    <div
                      className="sticky left-0 z-10 flex items-center border-r border-ink-200 bg-inherit"
                      style={{
                        width: LEFT_COL_WIDTH,
                        minWidth: LEFT_COL_WIDTH,
                      }}
                    >
                      {/* Expand toggle (epics only) */}
                      {t.is_epic && row.hasChildren ? (
                        <button
                          onClick={() => toggleCollapsed(t.id)}
                          aria-label={row.isExpanded ? "Collapse" : "Expand"}
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-800"
                        >
                          {row.isExpanded ? (
                            <IconChevronDown size={14} strokeWidth={2} />
                          ) : (
                            <IconChevronRight size={14} strokeWidth={2} />
                          )}
                        </button>
                      ) : (
                        <span
                          className="shrink-0"
                          style={{ width: isChild ? 20 : 24 }}
                        />
                      )}
                      <button
                        onClick={() => setSelected(t)}
                        className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-3 text-left hover:bg-brand-50/40"
                      >
                        {isChild && (
                          <span className="shrink-0 text-ink-400">↳</span>
                        )}
                        {t.is_epic && (
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-purple-600 text-white">
                            <IconEpic size={11} strokeWidth={2.25} />
                          </span>
                        )}
                        <PriorityIcon priority={t.priority} size={12} />
                        <span className="shrink-0 font-mono text-[11px] font-semibold text-ink-500">
                          {isChild && row.parentKey ? (
                            <>
                              <span className="text-ink-400">{row.parentKey}</span>
                              <span className="mx-0.5 text-ink-300">/</span>
                              <span>{t.key}</span>
                            </>
                          ) : (
                            t.key
                          )}
                        </span>
                        <span
                          className={`truncate text-[12.5px] ${
                            t.is_epic
                              ? "font-semibold text-ink-900"
                              : "text-ink-800"
                          }`}
                        >
                          {t.title}
                        </span>
                        {assignee && (
                          <span className="ml-auto shrink-0">
                            <Avatar
                              name={assignee.name}
                              seed={assignee.id}
                              size={18}
                            />
                          </span>
                        )}
                      </button>
                    </div>

                    {/* Timeline lane */}
                    <div
                      className="relative"
                      style={{ width: gridWidth, minWidth: gridWidth }}
                    >
                      {/* Day gridlines + weekend shading */}
                      <div className="absolute inset-0 flex">
                        {days.map((d, i) => {
                          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                          return (
                            <div
                              key={i}
                              className={`h-full border-r border-ink-100 ${
                                isWeekend ? "bg-ink-50/60" : ""
                              }`}
                              style={{ width: DAY_WIDTH, minWidth: DAY_WIDTH }}
                            />
                          );
                        })}
                      </div>

                      {/* Bar or milestone */}
                      {renderBar({
                        start,
                        due,
                        rangeStart,
                        totalDays,
                        todayOffset,
                        color: barColor,
                        overdue: !!overdue,
                        onClick: () => setSelected(t),
                        title: t.title,
                        labels: labels.map((l) => ({
                          name: l.name,
                          color: l.color,
                        })),
                        completed: !!t.completed_at,
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {newTaskOpen && (
        <NewTaskModal
          tree={data}
          onClose={() => setNewTaskOpen(false)}
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

// --- Bar renderer -----------------------------------------------------------

function renderBar({
  start,
  due,
  rangeStart,
  totalDays,
  todayOffset,
  color,
  overdue,
  onClick,
  title,
  labels,
  completed,
}: {
  start: Date | null;
  due: Date | null;
  rangeStart: Date;
  totalDays: number;
  todayOffset: number;
  color: string;
  overdue: boolean;
  onClick: () => void;
  title: string;
  labels: { name: string; color: string }[];
  completed: boolean;
}) {
  // Unscheduled: no dates → muted placeholder anchored near today so it's
  // visible in the initial viewport. Clicking opens the drawer to set dates.
  if (!start && !due) {
    const anchor = Math.min(Math.max(todayOffset, 0), totalDays - 1);
    return (
      <button
        onClick={onClick}
        className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1 rounded-md border border-dashed border-ink-300 bg-white px-2 py-0.5 text-[10.5px] font-medium text-ink-500 hover:border-ink-400 hover:text-ink-700"
        style={{ left: anchor * DAY_WIDTH + 2 }}
        title={`${title} — not scheduled`}
      >
        Not scheduled
      </button>
    );
  }
  // Milestone: only due date → diamond on that day.
  if (!start && due) {
    const offset = daysBetween(rangeStart, due);
    if (offset < 0 || offset >= totalDays) return null;
    return (
      <button
        onClick={onClick}
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
        style={{
          left: offset * DAY_WIDTH + DAY_WIDTH / 2,
        }}
        title={`${title} — due ${due.toLocaleDateString()}`}
      >
        <span
          className={`block h-3 w-3 rotate-45 rounded-[2px] ring-2 ring-white ${
            overdue ? "ring-danger-200" : ""
          }`}
          style={{ backgroundColor: overdue ? "#E2483D" : color }}
        />
      </button>
    );
  }
  // Start-only marker (open-ended).
  if (start && !due) {
    const offset = daysBetween(rangeStart, start);
    if (offset < 0 || offset >= totalDays) return null;
    return (
      <button
        onClick={onClick}
        className="absolute top-1/2 flex -translate-y-1/2 items-center gap-1"
        style={{ left: offset * DAY_WIDTH + 4 }}
        title={`${title} — starts ${start.toLocaleDateString()}`}
      >
        <span
          className="h-3 w-3 rounded-full ring-2 ring-white"
          style={{ backgroundColor: color }}
        />
        <span
          className="text-[10px] font-medium"
          style={{ color }}
        >
          start
        </span>
      </button>
    );
  }
  if (start && due) {
    // Normalize: treat inverted ranges by swapping.
    const a = start.getTime() <= due.getTime() ? start : due;
    const b = start.getTime() <= due.getTime() ? due : start;
    const startOff = daysBetween(rangeStart, a);
    const endOff = daysBetween(rangeStart, b);
    // clip to range
    const left = Math.max(0, startOff);
    const right = Math.min(totalDays - 1, endOff);
    if (right < 0 || left >= totalDays) return null;
    const width = (right - left + 1) * DAY_WIDTH - 4;
    return (
      <button
        onClick={onClick}
        className="group absolute top-1/2 flex -translate-y-1/2 items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-white shadow-sm transition hover:brightness-110"
        style={{
          left: left * DAY_WIDTH + 2,
          width: Math.max(12, width),
          height: ROW_HEIGHT - 12,
          backgroundColor: overdue ? "#E2483D" : color,
          opacity: completed ? 0.7 : 1,
        }}
        title={`${title} — ${a.toLocaleDateString()} → ${b.toLocaleDateString()}`}
      >
        {labels.slice(0, 1).map((l) => (
          <span
            key={l.name}
            className="shrink-0 rounded-sm px-1 text-[9.5px] font-semibold uppercase"
            style={{ backgroundColor: l.color, color: "#fff" }}
          >
            {l.name}
          </span>
        ))}
        <span className="truncate text-[11.5px] font-medium">{title}</span>
        {completed && (
          <span className="shrink-0 text-[10px] opacity-90">✓</span>
        )}
      </button>
    );
  }
  return null;
}
