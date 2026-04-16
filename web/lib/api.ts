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
  service_desk_enabled: boolean;
  created_at: string;
}

export type BoardType = "standard" | "service_desk";
export type BoardVisibility = "private" | "internal" | "public";

export interface Member {
  user: User;
  role: Role;
}

/** A user's membership projected across the teams they belong to. Used by
 * the admin "manage teams" drawer on the users page. */
export interface UserMembership {
  team_id: string;
  team_name: string;
  team_slug: string;
  role: Role;
}

export interface Board {
  id: string;
  team_id: string;
  name: string;
  key: string;
  description: string;
  type: BoardType;
  visibility: BoardVisibility;
  public_slug?: string | null;
  intake_column_id?: string | null;
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
  start_at?: string | null;
  due_at?: string | null;
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

// Comments & attachments

export type AttachmentKind = "file" | "internal";

export interface Attachment {
  id: string;
  team_id: string;
  uploader_id: string;
  kind: AttachmentKind;
  title: string;
  filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  target_type?: "task" | "board" | null;
  target_id?: string | null;
  created_at: string;
  download_url?: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  attachments: Attachment[];
}

/**
 * Upload a file as an attachment (multipart). Bypasses the JSON helper.
 */
export async function uploadAttachment(
  teamId: string,
  file: File,
  title?: string
): Promise<Attachment> {
  const fd = new FormData();
  fd.append("file", file);
  if (title) fd.append("title", title);
  const res = await fetch(`${API_BASE}/api/v1/teams/${teamId}/attachments`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || msg;
    } catch {}
    throw new ApiError(msg, res.status);
  }
  return res.json();
}

/**
 * Absolute URL for attachment download endpoint (redirects to a fresh
 * presigned URL). Safe to embed in <img src>.
 */
export function attachmentDownloadURL(id: string): string {
  return `${API_BASE}/api/v1/attachments/${id}/download`;
}

// --- Service desk ---

export type RequestFieldType =
  | "text"
  | "longtext"
  | "select"
  | "email"
  | "url"
  | "number"
  | "date";

export interface RequestTemplateField {
  id: string;
  template_id: string;
  key: string;
  label: string;
  type: RequestFieldType;
  required: boolean;
  position: number;
  options: string[];
  help_text: string;
}

export interface RequestTemplate {
  id: string;
  board_id: string;
  name: string;
  description: string;
  position: number;
  default_priority: Priority;
  archived_at?: string | null;
  created_at: string;
  fields: RequestTemplateField[];
}

export interface RequestSubmission {
  id: string;
  template_id: string;
  task_id: string;
  submitter_email: string;
  submitter_name: string;
  submitter_user_id?: string | null;
  values: Record<string, string>;
  created_at: string;
}

export interface DeskView {
  name: string;
  description: string;
  slug: string;
  visibility: BoardVisibility;
  team_name: string;
  team_slug: string;
  templates: RequestTemplate[];
}

/** Entry on the /service-desk landing page. Only the team's display
 * identity is exposed; ids stay server-side. */
export interface ServiceDeskTeamSummary {
  name: string;
  slug: string;
}

/** Per-team desks page. `desks` is already filtered to what the
 * caller is permitted to see (public for anon, +internal when authed). */
export interface ServiceDeskTeamPage {
  team: ServiceDeskTeamSummary;
  desks: {
    name: string;
    description: string;
    slug: string;
    visibility: BoardVisibility;
  }[];
}

export interface DeskMessage {
  id: string;
  submission_id: string;
  from_submitter: boolean;
  author_user_id?: string | null;
  author_name: string;
  body: string;
  created_at: string;
}

/** One row on the signed-in /service-desk/mine list page. */
export interface MySubmissionSummary {
  submission_id: string;
  desk_slug: string;
  desk_name: string;
  task_key: string;
  title: string;
  status: string;
  status_kind: ColumnType;
  completed: boolean;
  submitted_at: string;
}

export interface DeskTrackingInfo {
  desk: { slug: string; name: string };
  task_key: string;
  title: string;
  status: string;
  status_kind: ColumnType;
  submitted_at: string;
  submitter_email: string;
  submitter_name: string;
  values: Record<string, string>;
  completed: boolean;
  messages: DeskMessage[];
}

// --- My tasks ---

/** Response shape for GET /me/tasks. Tasks span multiple boards and
 * teams, so the endpoint bundles every referenced entity alongside the
 * task list. The client turns the arrays into id→object maps and renders
 * without any further round-trips. */
export interface MyTasksResponse {
  tasks: Task[];
  boards: Board[];
  columns: Column[];
  teams: Team[];
  users: User[];
  labels: Label[];
}

/** Which bucket(s) to include in the my-tasks response. The caller picks
 * any combination; omitting all three falls back to "assigned". */
export type MyTasksInclude = "assigned" | "unassigned" | "reported";

/**
 * Unauthenticated fetch for the public desk endpoints. Kept separate
 * from `api()` because we deliberately avoid sending the session cookie
 * — a signed-in submitter doesn't need their session attached to the
 * form they're filling out.
 */
export async function publicApi<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    // include so authed users can submit to internal desks; the
    // OptionalAuth middleware picks it up when present.
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
