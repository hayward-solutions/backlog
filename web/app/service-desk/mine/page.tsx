"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { ApiError, MySubmissionSummary, api } from "@/lib/api";
import { StatusPill } from "@/components/ui/Badge";

/**
 * Signed-in "my requests" directory. Lists every submission the current
 * user made while authenticated, with a status chip and a link through to
 * the full tracking page. Anonymous submissions aren't listed here —
 * those are reached via the original tracking URL only.
 */
export default function MySubmissionsPage() {
  const mine = useQuery({
    queryKey: ["desk-mine"],
    queryFn: () => api<MySubmissionSummary[]>("/desks/my-submissions"),
    retry: false,
    refetchInterval: 60_000,
  });

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="rounded-lg border border-ink-200 bg-ink-0 p-6 shadow-soft">
          <nav className="text-xs text-ink-500">
            <Link href="/service-desk" className="hover:underline">
              ← All teams
            </Link>
          </nav>
          <header className="mt-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              My requests
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              Track the status of support cases you&apos;ve submitted while
              signed in.
            </p>
          </header>

          {mine.isLoading && (
            <p className="mt-6 text-sm text-ink-500">Loading…</p>
          )}
          {mine.error && (
            <div className="mt-6 rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
              {(mine.error as ApiError).status === 401
                ? "Sign in to view your requests."
                : (mine.error as Error).message ||
                  "We couldn't load your requests right now."}
            </div>
          )}
          {mine.data && mine.data.length === 0 && (
            <div className="mt-6 rounded-md border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600">
              You haven&apos;t submitted any requests yet.{" "}
              <Link
                href="/service-desk"
                className="font-semibold text-brand-700 underline"
              >
                Browse service desks
              </Link>
              .
            </div>
          )}
          {mine.data && mine.data.length > 0 && (
            <ul className="mt-6 space-y-2">
              {mine.data.map((s) => (
                <li key={s.submission_id}>
                  <Link
                    href={`/service-desk/mine/${s.submission_id}`}
                    className="block rounded-md border border-ink-200 bg-ink-0 p-4 hover:border-brand-400 hover:bg-brand-50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500">
                            {s.desk_name}
                          </span>
                          {s.task_key && (
                            <span className="rounded-xs bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-700">
                              {s.task_key}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold text-ink-900">
                          {s.title || "Your request"}
                        </div>
                        <div className="mt-1 text-xs text-ink-500">
                          Submitted{" "}
                          {new Date(s.submitted_at).toLocaleString(undefined, {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <StatusPill type={s.status_kind}>
                          {s.status}
                        </StatusPill>
                        {s.completed && (
                          <span className="text-[11px] text-success-700">
                            Resolved
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
