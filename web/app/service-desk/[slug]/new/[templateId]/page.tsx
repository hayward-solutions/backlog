"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ApiError, DeskView, publicApi } from "@/lib/api";
import {
  DeskShell,
  SubmissionForm,
} from "@/components/service-desk/SubmissionForm";

export default function DeskNewSubmissionPage() {
  const { slug, templateId } = useParams<{
    slug: string;
    templateId: string;
  }>();

  const desk = useQuery({
    queryKey: ["desk", slug],
    queryFn: () => publicApi<DeskView>(`/public/desks/${slug}`),
    retry: false,
  });

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
                href={`/login?next=${encodeURIComponent(
                  `/service-desk/${slug}/new/${templateId}`
                )}`}
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
  const template = view.templates.find(
    (t) => t.id === templateId && !t.archived_at
  );

  if (!template) {
    return (
      <DeskShell>
        <nav className="mb-3 text-xs text-ink-500">
          <Link
            href={`/service-desk/${slug}`}
            className="hover:underline"
          >
            ← Back to request types
          </Link>
        </nav>
        <div className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
          That request type isn&apos;t available.
        </div>
      </DeskShell>
    );
  }

  return (
    <DeskShell>
      <nav className="mb-3 text-xs text-ink-500">
        <Link
          href={`/service-desk/${slug}`}
          className="hover:underline"
        >
          ← Back to request types
        </Link>
      </nav>
      <header className="mb-4">
        <div className="text-xs uppercase tracking-wide text-ink-500">
          {view.name}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
          {template.name}
        </h1>
      </header>
      <SubmissionForm slug={slug} template={template} />
    </DeskShell>
  );
}
