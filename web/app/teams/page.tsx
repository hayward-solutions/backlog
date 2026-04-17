"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { api, Team } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconHome, IconUsers } from "@/components/ui/icons";

export default function TeamsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });

  return (
    <AppShell>
      <div className="border-b border-ink-200 bg-ink-0 px-4 py-4 sm:px-6">
        <h1 className="flex items-center gap-2 text-[20px] font-semibold tracking-tight text-ink-900">
          <IconHome size={18} className="text-ink-500" /> Your teams
        </h1>
        <p className="text-sm text-ink-600">Jump into a team to open its boards.</p>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading && (
          <p className="text-sm text-ink-500">Loading teams…</p>
        )}
        {error && (
          <p className="text-sm text-danger-600">{(error as Error).message}</p>
        )}

        {data && data.length === 0 && (
          <EmptyState
            icon={<IconUsers size={18} />}
            title="No teams yet"
            description="You're not a member of any teams. Ask a server admin to invite you or create one for you."
          />
        )}

        {data && data.length > 0 && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/teams/${t.id}`}
                  className="card-hover block rounded-lg border border-ink-200 bg-ink-0 p-4"
                >
                  <div className="flex items-start gap-3">
                    <Avatar name={t.name} seed={t.id} size={40} />
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-ink-900">
                        {t.name}
                      </div>
                      <div className="truncate font-mono text-[11.5px] uppercase tracking-wide text-ink-500">
                        {t.slug}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-ink-500">
                    <span>Created {new Date(t.created_at).toLocaleDateString()}</span>
                    <span className="font-medium text-brand-600">Open →</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
