"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Menu, MenuDivider, MenuItem } from "@/components/ui/Menu";
import { IconChevronDown, IconLogout, IconSettings, IconUsers } from "@/components/ui/icons";

export function TopBar({
  children,
}: {
  /** Optional center/left breadcrumb or title slot */
  children?: React.ReactNode;
}) {
  const router = useRouter();
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-ink-200 bg-white/95 px-4 backdrop-blur sm:px-6">
      <div className="min-w-0 flex-1 truncate">{children}</div>

      {me && (
        <Menu
          align="right"
          width={220}
          trigger={(open) => (
            <span
              className={`flex h-9 items-center gap-2 rounded-md px-1.5 pr-2 text-sm transition ${
                open ? "bg-ink-100" : "hover:bg-ink-50"
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
