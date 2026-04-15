"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, BoardTree, Member } from "@/lib/api";

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
  }
>(function BoardToolbar(
  { tree, state, onChange, onNewTask, visibleCount, totalCount },
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

  return (
    <div className="flex flex-wrap items-center gap-3 border-b bg-neutral-50 px-6 py-2 text-sm">
      <input
        value={state.q}
        onChange={(e) => onChange({ ...state, q: e.target.value })}
        placeholder="Search title…"
        className="rounded border border-neutral-300 px-2 py-1"
      />
      <select
        value={state.filter}
        onChange={(e) => onChange({ ...state, filter: e.target.value as Filter })}
        className="rounded border border-neutral-300 px-2 py-1"
        title="Status"
      >
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </select>
      <select
        value={state.assignee}
        onChange={(e) => onChange({ ...state, assignee: e.target.value })}
        className="rounded border border-neutral-300 px-2 py-1"
        title="Assignee"
      >
        <option value="">Assignee: any</option>
        <option value="none">Unassigned</option>
        {memberOptions.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.display_name || m.user.email}
          </option>
        ))}
      </select>
      <select
        value={state.reporter}
        onChange={(e) => onChange({ ...state, reporter: e.target.value })}
        className="rounded border border-neutral-300 px-2 py-1"
        title="Reporter"
      >
        <option value="">Reporter: any</option>
        {memberOptions.map((m) => (
          <option key={m.user.id} value={m.user.id}>
            {m.user.display_name || m.user.email}
          </option>
        ))}
      </select>
      {tree.labels.length > 0 && (
        <select
          value={state.label}
          onChange={(e) => onChange({ ...state, label: e.target.value })}
          className="rounded border border-neutral-300 px-2 py-1"
          title="Label"
        >
          <option value="">Label: any</option>
          <option value="none">No labels</option>
          {tree.labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      {typeof visibleCount === "number" && typeof totalCount === "number" && (
        <span className="text-neutral-500">
          {visibleCount} of {totalCount}
        </span>
      )}
      <button
        type="button"
        onClick={() => onNewTask()}
        className="ml-auto rounded bg-neutral-900 px-3 py-1 text-white"
      >
        + New task
      </button>
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
