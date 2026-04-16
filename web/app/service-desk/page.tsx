"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { api, publicApi, ServiceDeskTeamSummary, User } from "@/lib/api";

export default function ServiceDeskLandingPage() {
  const teams = useQuery({
    queryKey: ["service-desk-teams"],
    queryFn: () =>
      publicApi<ServiceDeskTeamSummary[]>("/public/service-desk/teams"),
    retry: false,
  });
  // Tell signed-in users where to find their own history. Anonymous
  // callers see a 401 here; retry:false keeps the card layout stable.
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
    retry: false,
  });

  return (
    <Shell>
      {me.data && (
        <Link
          href="/service-desk/mine"
          className="mb-5 flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 p-3 hover:border-brand-400"
        >
          <div>
            <div className="text-sm font-semibold text-brand-900">
              My requests
            </div>
            <div className="text-xs text-brand-700">
              Track the status of support cases you&apos;ve submitted.
            </div>
          </div>
          <span className="text-sm font-semibold text-brand-700">Open →</span>
        </Link>
      )}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          Service desks
        </h1>
        <p className="mt-1 text-sm text-ink-600">
          Pick a team to see the kinds of requests they take.
        </p>
        <p className="mt-2 text-xs text-ink-500">
          Some desks are only visible after you{" "}
          <Link href="/login" className="font-semibold underline">
            sign in
          </Link>
          .
        </p>
      </header>

      <section className="mt-6">
        {teams.isLoading && (
          <p className="text-sm text-ink-500">Loading…</p>
        )}
        {teams.error && (
          <div className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
            We couldn&apos;t load the directory right now. Please try again.
          </div>
        )}
        {teams.data && teams.data.length === 0 && (
          <div className="rounded-md border border-dashed border-ink-200 p-6 text-center">
            <p className="text-sm text-ink-700">
              No service desks are open right now.
            </p>
            <p className="mt-1 text-xs text-ink-500">
              If your team has an internal desk, sign in to see it.
            </p>
          </div>
        )}
        {teams.data && teams.data.length > 0 && (
          <ul className="space-y-2">
            {teams.data.map((t) => (
              <li key={t.slug}>
                <Link
                  href={`/service-desk/team/${t.slug}`}
                  className="flex items-center justify-between rounded-md border border-ink-200 bg-white p-4 hover:border-brand-400 hover:bg-brand-50"
                >
                  <div>
                    <div className="text-sm font-semibold text-ink-900">
                      {t.name}
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-wide text-ink-500">
                      {t.slug}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-brand-700">
                    Open →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-soft">
          {children}
        </div>
      </div>
    </div>
  );
}
