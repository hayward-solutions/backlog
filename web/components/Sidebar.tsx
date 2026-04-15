"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, Board, Team, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import {
  IconBoard,
  IconEpic,
  IconList,
  IconPlus,
  IconSettings,
  IconUsers,
  IconHome,
} from "@/components/ui/icons";

export function Sidebar({
  teamId,
  boardId,
}: {
  teamId?: string;
  boardId?: string;
}) {
  const pathname = usePathname();

  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });
  const boards = useQuery({
    enabled: !!teamId,
    queryKey: ["boards", teamId],
    queryFn: () => api<Board[]>(`/teams/${teamId}/boards`),
  });

  const activeTeam = teams.data?.find((t) => t.id === teamId);

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col border-r border-ink-200 bg-white">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-ink-200 px-4">
        <Link href="/teams" className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.95" />
              <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.75" />
              <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.85" />
            </svg>
          </span>
          <span className="text-[15px] font-semibold tracking-tight text-ink-900">
            Backlog
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <SidebarLink
          href="/teams"
          icon={<IconHome size={16} />}
          active={pathname === "/teams"}
        >
          All teams
        </SidebarLink>

        {activeTeam && (
          <div className="mt-4">
            <SidebarSectionTitle>Team</SidebarSectionTitle>
            <SidebarLink
              href={`/teams/${activeTeam.id}`}
              icon={
                <Avatar
                  name={activeTeam.name}
                  seed={activeTeam.id}
                  size={18}
                />
              }
              active={pathname === `/teams/${activeTeam.id}`}
            >
              <span className="truncate">{activeTeam.name}</span>
            </SidebarLink>
            <SidebarLink
              href={`/teams/${activeTeam.id}/settings`}
              icon={<IconSettings size={16} />}
              active={pathname === `/teams/${activeTeam.id}/settings`}
              indent
            >
              Members & settings
            </SidebarLink>

            <SidebarSectionTitle className="mt-3">
              Boards
            </SidebarSectionTitle>
            <ul className="space-y-0.5">
              {(boards.data ?? []).map((b) => (
                <li key={b.id}>
                  <BoardLink
                    board={b}
                    isActive={b.id === boardId}
                    pathname={pathname ?? ""}
                  />
                </li>
              ))}
              {boards.data?.length === 0 && (
                <li className="px-2 py-1 text-xs text-ink-500">
                  No boards yet
                </li>
              )}
            </ul>
          </div>
        )}

        {!activeTeam && (teams.data ?? []).length > 0 && (
          <div className="mt-4">
            <SidebarSectionTitle>Your teams</SidebarSectionTitle>
            <ul className="space-y-0.5">
              {(teams.data ?? []).slice(0, 8).map((t) => (
                <li key={t.id}>
                  <SidebarLink
                    href={`/teams/${t.id}`}
                    icon={<Avatar name={t.name} seed={t.id} size={18} />}
                    active={pathname?.startsWith(`/teams/${t.id}`) ?? false}
                  >
                    <span className="truncate">{t.name}</span>
                  </SidebarLink>
                </li>
              ))}
            </ul>
          </div>
        )}

        {me.data?.is_system_admin && (
          <div className="mt-4">
            <SidebarSectionTitle>Admin</SidebarSectionTitle>
            <SidebarLink
              href="/admin/users"
              icon={<IconUsers size={16} />}
              active={pathname?.startsWith("/admin/users") ?? false}
            >
              Users
            </SidebarLink>
            <SidebarLink
              href="/admin/teams"
              icon={<IconList size={16} />}
              active={pathname?.startsWith("/admin/teams") ?? false}
            >
              Teams
            </SidebarLink>
          </div>
        )}
      </nav>
    </aside>
  );
}

function SidebarSectionTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`px-2 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500 ${className}`.trim()}
    >
      {children}
    </div>
  );
}

function SidebarLink({
  href,
  icon,
  active,
  children,
  indent = false,
}: {
  href: string;
  icon?: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
  indent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${
        indent ? "ml-5" : ""
      } ${
        active
          ? "bg-brand-50 font-semibold text-brand-700"
          : "text-ink-700 hover:bg-ink-50"
      }`}
    >
      {icon && (
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center ${
            active ? "text-brand-600" : "text-ink-500 group-hover:text-ink-700"
          }`}
        >
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </Link>
  );
}

function BoardLink({
  board,
  isActive,
  pathname,
}: {
  board: Board;
  isActive: boolean;
  pathname: string;
}) {
  const base = `/boards/${board.id}`;
  return (
    <div>
      <Link
        href={base}
        className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition ${
          isActive
            ? "bg-brand-50 font-semibold text-brand-700"
            : "text-ink-700 hover:bg-ink-50"
        }`}
      >
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center ${
            isActive ? "text-brand-600" : "text-ink-500 group-hover:text-ink-700"
          }`}
        >
          <IconBoard size={16} />
        </span>
        <span className="min-w-0 flex-1 truncate">{board.name}</span>
      </Link>
      {isActive && (
        <ul className="my-1 space-y-0.5 border-l border-ink-200 pl-3 ml-[18px]">
          <BoardSubLink
            href={base}
            active={pathname === base}
            icon={<IconBoard size={14} />}
          >
            Board
          </BoardSubLink>
          <BoardSubLink
            href={`${base}/tasks`}
            active={pathname === `${base}/tasks`}
            icon={<IconList size={14} />}
          >
            Tasks
          </BoardSubLink>
          <BoardSubLink
            href={`${base}/epics`}
            active={pathname === `${base}/epics`}
            icon={<IconEpic size={14} />}
          >
            Epics
          </BoardSubLink>
          <BoardSubLink
            href={`${base}/settings`}
            active={pathname === `${base}/settings`}
            icon={<IconSettings size={14} />}
          >
            Settings
          </BoardSubLink>
        </ul>
      )}
    </div>
  );
}

function BoardSubLink({
  href,
  active,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className={`flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] ${
          active
            ? "font-semibold text-brand-700"
            : "text-ink-600 hover:text-ink-900"
        }`}
      >
        <span
          className={`flex h-4 w-4 items-center justify-center ${
            active ? "text-brand-600" : "text-ink-400"
          }`}
        >
          {icon}
        </span>
        {children}
      </Link>
    </li>
  );
}
