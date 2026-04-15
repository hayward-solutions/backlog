export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    ...init,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// Types mirror the Go domain package.
export type Role = "owner" | "editor" | "member" | "viewer";
export type ColumnType = "todo" | "in_progress" | "done";
export type Priority = "low" | "med" | "high" | "urgent";

export interface User {
  id: string;
  email: string;
  display_name: string;
  is_system_admin: boolean;
  disabled_at?: string | null;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Member {
  user: User;
  role: Role;
}

export interface Board {
  id: string;
  team_id: string;
  name: string;
  key: string;
  description: string;
  archived_at?: string | null;
  created_at: string;
}

export interface Column {
  id: string;
  board_id: string;
  name: string;
  position: number;
  type: ColumnType;
  wip_limit?: number | null;
}

export interface Label {
  id: string;
  team_id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  epic_id?: string | null;
  is_epic: boolean;
  key: string;
  title: string;
  description: string;
  priority: Priority;
  assignee_id?: string | null;
  reporter_id: string;
  estimate_hours?: number | null;
  deadline_at?: string | null;
  position: number;
  created_at: string;
  completed_at?: string | null;
  label_ids: string[];
}

export interface BoardTree {
  board: Board;
  columns: Column[];
  tasks: Task[];
  labels: Label[];
  your_role: Role;
}

const roleRank: Record<Role, number> = {
  viewer: 0,
  member: 1,
  editor: 2,
  owner: 3,
};
export function canManageBoards(role: Role): boolean {
  return roleRank[role] >= roleRank.editor;
}
