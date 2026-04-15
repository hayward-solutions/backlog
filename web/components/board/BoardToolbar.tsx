"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, BoardTree, Member } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { IconFilter, IconPlus, IconSearch } from "@/components/ui/icons";

export type Filter = "all" | "open" | "done";
// "" = any; "none" = unassigned/no reporter; userID = that user
export type PersonFilter = "" | "none" | string;

// "" = any; "none" = no labels; labelID = has that label
export type LabelFilter = "" | "none" | string;

export interface ToolbarState {
  q: string;
  filter: Filter;
  assignee: PersonFilter;
  reporter: PersonFilter;
  label: LabelFilter;
}

export const defaultToolbarState: ToolbarState = {
  q: "",
  filter: "all",
  assignee: "",
  reporter: "",
  label: "",
};

export interface BoardToolbarHandle {
  focusNewTask: (columnId?: string) => void;
}

export const BoardToolbar = forwardRef<
  BoardToolbarHandle,
  {
    tree: BoardTree;
    state: ToolbarState;
    onChange: (s: ToolbarState) => void;
    onNewTask: (columnId?: string) => void;
    visibleCount?: number;
    totalCount?: number;
    newTaskLabel?: string;
  }
>(function BoardToolbar(
  {
    tree,
    state,
    onChange,
    onNewTask,
    visibleCount,
    totalCount,
    newTaskLabel = "New task",
  },
  ref
) {
  const members = useQuery({
    queryKey: ["members", tree.board.team_id],
    queryFn: () => api<Member[]>(`/teams/${tree.board.team_id}/members`),
  });

  useImperativeHandle(ref, () => ({
    focusNewTask: (columnId?: string) => {
      onNewTask(columnId);
    },
  }));

  const memberOptions = members.data ?? [];
  const activeFilterCount =
    (state.filter !== "all" ? 1 : 0) +
    (state.assignee ? 1 : 0) +
    (state.reporter ? 1 : 0) +
    (state.label ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-white px-4 py-2.5 sm:px-6">
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500">
          <IconSearch size={14} />
        </span>
        <input
          value={state.q}
          onChange={(e) => onChange({ ...state, q: e.target.value })}
          placeholder="Search tasks…"
          className="control w-56 pl-8"
        />
      </div>

      <div className="hidden items-center gap-1 border-l border-ink-200 pl-2 sm:flex">
        <span className="text-ink-500">
          <IconFilter size={14} />
        </span>
        {activeFilterCount > 0 && (
          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
            {activeFilterCount}
          </span>
        )}
      </div>

      <Select
        value={state.filter}
        onChange={(e) => onChange({ ...state, filter: e.target.value as Filter })}
        title="Status"
      >
        <option value="all">All status</option>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </Select>

      <Select
        value={state.assignee}
        onChange={(e) => onChange({ ...state, assignee: e.target.value })}
        title="Assignee"
      >
        <option value="">Any assignee</option>
        <option value="none">Unassigned</option>
        {memberOptions.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.display_name || m.user.email}
          </option>
        ))}
      </Select>

      <Select
        value={state.reporter}
        onChange={(e) => onChange({ ...state, reporter: e.target.value })}
        title="Reporter"
      >
        <option value="">Any reporter</option>
        {memberOptions.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.display_name || m.user.email}
          </option>
        ))}
      </Select>

      {tree.labels.length > 0 && (
        <Select
          value={state.label}
          onChange={(e) => onChange({ ...state, label: e.target.value })}
          title="Label"
        >
          <option value="">Any label</option>
          <option value="none">No labels</option>
          {tree.labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
      )}

      {typeof visibleCount === "number" && typeof totalCount === "number" && (
        <span className="hidden text-xs text-ink-500 lg:inline">
          {visibleCount === totalCount
            ? `${totalCount} item${totalCount === 1 ? "" : "s"}`
            : `${visibleCount} of ${totalCount}`}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button variant="primary" onClick={() => onNewTask()}>
          <IconPlus size={14} strokeWidth={2.25} />
          {newTaskLabel}
        </Button>
      </div>
    </div>
  );
});

export function filterTasks<
  T extends {
    title: string;
    completed_at?: string | null;
    assignee_id?: string | null;
    reporter_id: string;
    label_ids: string[];
  }
>(tasks: T[], state: ToolbarState): T[] {
  const needle = state.q.trim().toLowerCase();
  return tasks.filter((t) => {
    if (state.filter === "open" && t.completed_at) return false;
    if (state.filter === "done" && !t.completed_at) return false;
    if (needle && !t.title.toLowerCase().includes(needle)) return false;
    if (state.assignee === "none" && t.assignee_id) return false;
    if (state.assignee && state.assignee !== "none" && t.assignee_id !== state.assignee)
      return false;
    if (state.reporter && t.reporter_id !== state.reporter) return false;
    if (state.label === "none" && t.label_ids.length > 0) return false;
    if (state.label && state.label !== "none" && !t.label_ids.includes(state.label))
      return false;
    return true;
  });
}
