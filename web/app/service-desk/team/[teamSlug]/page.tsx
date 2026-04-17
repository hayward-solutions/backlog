"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ApiError, publicApi, ServiceDeskTeamPage } from "@/lib/api";
import { Badge } from "@/components/ui/Badge";

export default function ServiceDeskTeamPageRoute() {
  const { teamSlug } = useParams<{ teamSlug: string }>();

  const page = useQuery({
    queryKey: ["service-desk-team", teamSlug],
    queryFn: () =>
      publicApi<ServiceDeskTeamPage>(
        `/public/service-desk/teams/${teamSlug}`
      ),
    retry: false,
  });

  return (
    <Shell>
      <nav className="text-xs text-ink-500">
        <Link href="/service-desk" className="hover:underline">
          ← All teams
        </Link>
      </nav>

      {page.isLoading && (
        <p className="mt-4 text-sm text-ink-500">Loading…</p>
      )}
      {page.error && (
        <div className="mt-4 rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          {(page.error as ApiError).status === 404
            ? "We couldn't find a service desk for that team."
            : (page.error as Error).message ||
              "We couldn't load this team right now."}
        </div>
      )}
      {page.data && (
        <>
          <header className="mt-3">
            <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
              {page.data.team.name}
            </h1>
            <p className="mt-1 text-sm text-ink-600">
              Choose a service desk to see the request types it offers.
            </p>
          </header>

          <ul className="mt-6 space-y-2">
            {page.data.desks.map((d) => (
              <li key={d.slug}>
                <Link
                  href={`/service-desk/${d.slug}`}
                  className="block rounded-md border border-ink-200 bg-ink-0 p-4 hover:border-brand-400 hover:bg-brand-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-900">
                          {d.name}
                        </span>
                        <Badge
                          tone={d.visibility === "public" ? "green" : "purple"}
                        >
                          {d.visibility === "public"
                            ? "Public"
                            : "Signed-in users"}
                        </Badge>
                      </div>
                      {d.description ? (
                        <p className="mt-1 text-sm text-ink-600">
                          {d.description}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-ink-400">
                          No description
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-brand-700">
                      Open →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="rounded-lg border border-ink-200 bg-ink-0 p-6 shadow-soft">
          {children}
        </div>
      </div>
    </div>
  );
}
