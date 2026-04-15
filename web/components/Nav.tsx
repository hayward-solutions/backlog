"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, User } from "@/lib/api";

export function Nav() {
  const router = useRouter();
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function logout() {
    setOpen(false);
    await api("/auth/logout", { method: "POST" });
    router.push("/login");
  }

  const label = me?.display_name || me?.email || "Account";

  return (
    <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-6 py-3">
      <div className="flex items-center gap-4">
        <Link href="/teams" className="font-semibold">
          Backlog
        </Link>
      </div>
      <div className="relative text-sm" ref={ref}>
        {me && (
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 rounded px-2 py-1 text-neutral-700 hover:bg-neutral-100"
          >
            <span>{label}</span>
            <span className="text-xs text-neutral-500">▾</span>
          </button>
        )}
        {open && me && (
          <div className="absolute right-0 z-50 mt-1 w-48 overflow-hidden rounded border bg-white shadow-md">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="block px-4 py-2 hover:bg-neutral-50"
            >
              My account
            </Link>
            {me.is_system_admin && (
              <>
                <div className="border-t" />
                <Link
                  href="/admin/users"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 hover:bg-neutral-50"
                >
                  Users
                </Link>
                <Link
                  href="/admin/teams"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 hover:bg-neutral-50"
                >
                  Teams
                </Link>
              </>
            )}
            <div className="border-t" />
            <button
              onClick={logout}
              className="block w-full px-4 py-2 text-left text-neutral-600 hover:bg-neutral-50"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
