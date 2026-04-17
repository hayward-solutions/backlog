"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { ApiError, DeskView, publicApi } from "@/lib/api";
import { DeskShell } from "@/components/service-desk/SubmissionForm";

/**
 * Template picker for a single service desk. Users pick one of the
 * desk's request types; the actual submission form lives at
 * /service-desk/[slug]/new/[templateId].
 */
export default function DeskTemplatePickerPage() {
  const { slug } = useParams<{ slug: string }>();

  const desk = useQuery({
    queryKey: ["desk", slug],
    queryFn: () => publicApi<DeskView>(`/public/desks/${slug}`),
    retry: false,
  });

  const templates = useMemo(
    () => (desk.data?.templates ?? []).filter((t) => !t.archived_at),
    [desk.data]
  );

  if (desk.isLoading) {
    return (
      <DeskShell>
        <div className="text-sm text-ink-500">Loading…</div>
      </DeskShell>
    );
  }
  if (desk.error) {
    const e = desk.error as ApiError;
    return (
      <DeskShell>
        <div className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          {e.status === 401 ? (
            <>
              This service desk is for signed-in users only.{" "}
              <Link
                href={`/login?next=${encodeURIComponent(`/service-desk/${slug}`)}`}
                className="font-semibold underline"
              >
                Sign in
              </Link>{" "}
              to continue.
            </>
          ) : (
            e.message || "This service desk isn't available."
          )}
        </div>
      </DeskShell>
    );
  }

  const view = desk.data!;
  return (
    <DeskShell>
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
        <Link href="/service-desk" className="hover:underline">
          Service desks
        </Link>
        {view.team_slug && (
          <>
            <span className="text-ink-300">/</span>
            <Link
              href={`/service-desk/team/${view.team_slug}`}
              className="hover:underline"
            >
              {view.team_name}
            </Link>
          </>
        )}
      </nav>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
          {view.name}
        </h1>
        {view.description && (
          <p className="mt-1 text-sm text-ink-600">{view.description}</p>
        )}
        {view.visibility === "internal" && (
          <p className="mt-2 text-xs text-ink-500">
            This desk is visible to signed-in users only.
          </p>
        )}
      </header>

      {templates.length === 0 ? (
        <div className="rounded-md border border-ink-200 bg-ink-50 p-4 text-sm text-ink-600">
          This desk doesn&apos;t have any request types yet.
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm font-semibold text-ink-700">
            What do you need?
          </p>
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/service-desk/${slug}/new/${t.id}`}
                  className="block rounded-md border border-ink-200 bg-ink-0 p-4 hover:border-brand-400 hover:bg-brand-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-ink-900">
                        {t.name}
                      </div>
                      {t.description ? (
                        <p className="mt-1 text-sm text-ink-600">
                          {t.description}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs italic text-ink-400">
                          No description
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-brand-700">
                      Start →
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </DeskShell>
  );
}
