"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, MenuDivider, MenuItem } from "@/components/ui/Menu";
import {
  IconChevronDown,
  IconLifeBuoy,
  IconList,
  IconLogout,
  IconMenu,
  IconMoon,
  IconSettings,
  IconSun,
  IconUsers,
} from "@/components/ui/icons";
import { useTheme } from "@/lib/theme";

export function TopBar({
  children,
  onMenuClick,
}: {
  /** Optional center/left breadcrumb or title slot */
  children?: React.ReactNode;
  /** Shown on mobile; opens the navigation drawer */
  onMenuClick?: () => void;
}) {
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const label = me?.display_name || me?.email || "Account";

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-ink-200 bg-ink-0/95 px-2 backdrop-blur sm:gap-4 sm:px-6">
      {onMenuClick && (
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open navigation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-ink-700 hover:bg-ink-100 md:hidden"
        >
          <IconMenu size={20} />
        </button>
      )}
      <div className="min-w-0 flex-1 truncate">{children}</div>

      <button
        type="button"
        onClick={toggle}
        aria-label={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        title={resolved === "dark" ? "Switch to light theme" : "Switch to dark theme"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink-700 hover:bg-ink-100 hover:text-ink-900"
      >
        {resolved === "dark" ? <IconSun size={16} /> : <IconMoon size={16} />}
      </button>

      {me && (
        <Link
          href="/service-desk"
          title="Open the service-desk directory"
          className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm text-ink-700 hover:bg-ink-100 hover:text-ink-900"
        >
          <IconLifeBuoy size={16} className="text-ink-500" />
          <span className="hidden sm:inline">Service desk</span>
        </Link>
      )}

      {me && (
        <Menu
          align="right"
          width={220}
          trigger={(open) => (
            <span
              className={`flex h-9 items-center gap-2 rounded-md px-1.5 pr-2 text-sm transition ${
                open ? "bg-ink-100" : "hover:bg-ink-100"
              }`}
            >
              <Avatar name={label} seed={me.id} size={26} />
              <span className="hidden truncate text-ink-800 sm:inline">{label}</span>
              <IconChevronDown size={14} className="text-ink-500" />
            </span>
          )}
        >
          {(close) => (
            <>
              <div className="px-3 py-2">
                <div className="truncate text-sm font-semibold text-ink-900">
                  {me.display_name || me.email}
                </div>
                <div className="truncate text-xs text-ink-500">{me.email}</div>
              </div>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  close();
                  router.push("/account");
                }}
              >
                <IconSettings size={14} className="text-ink-500" />
                My account
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  router.push("/my-tasks");
                }}
              >
                <IconList size={14} className="text-ink-500" />
                My tasks
              </MenuItem>
              <MenuItem
                onClick={() => {
                  close();
                  router.push("/service-desk/mine");
                }}
              >
                <IconLifeBuoy size={14} className="text-ink-500" />
                My requests
              </MenuItem>
              {me.is_system_admin && (
                <>
                  <MenuDivider />
                  <MenuItem
                    onClick={() => {
                      close();
                      router.push("/admin/users");
                    }}
                  >
                    <IconUsers size={14} className="text-ink-500" />
                    Manage users
                  </MenuItem>
                  <MenuItem
                    onClick={() => {
                      close();
                      router.push("/admin/teams");
                    }}
                  >
                    <IconSettings size={14} className="text-ink-500" />
                    Manage teams
                  </MenuItem>
                </>
              )}
              <MenuDivider />
              <MenuItem onClick={logout}>
                <IconLogout size={14} className="text-ink-500" />
                Sign out
              </MenuItem>
            </>
          )}
        </Menu>
      )}
      {!me && (
        <Link href="/login" className="btn btn-ghost">
          Sign in
        </Link>
      )}
    </header>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-ink-600">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-ink-300">/</span>}
          {it.href ? (
            <Link href={it.href} className="hover:text-ink-900 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className="font-semibold text-ink-900">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
