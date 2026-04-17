"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ApiError, DeskMessage, DeskTrackingInfo, publicApi } from "@/lib/api";
import { TrackingView } from "@/components/service-desk/TrackingView";

export default function DeskTrackPage() {
  const { slug, token } = useParams<{ slug: string; token: string }>();
  const queryKey = ["desk-track", slug, token] as const;

  const track = useQuery({
    queryKey,
    queryFn: () =>
      publicApi<DeskTrackingInfo>(`/public/desks/${slug}/track/${token}`),
    retry: false,
    // Refresh the status + thread every 30s while the page is open so
    // submitters can passively see team replies without refreshing.
    refetchInterval: 30_000,
  });

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="rounded-lg border border-ink-200 bg-ink-0 p-6 shadow-soft">
          {track.isLoading && (
            <div className="text-sm text-ink-500">Loading…</div>
          )}
          {track.error && (
            <div className="rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
              {(track.error as ApiError).message ||
                "We couldn't find that request."}
            </div>
          )}
          {track.data && (
            <TrackingView
              info={track.data}
              queryKey={queryKey}
              sendReply={(body) =>
                publicApi<DeskMessage>(
                  `/public/desks/${slug}/track/${token}/messages`,
                  {
                    method: "POST",
                    body: JSON.stringify({ body }),
                  }
                )
              }
              footer={
                <>
                  <div className="text-xs text-ink-500">
                    Bookmark this page — we&apos;ll update the status here as
                    your request moves through the queue.
                  </div>
                  <div className="mt-4">
                    <Link
                      href={`/service-desk/${slug}`}
                      className="text-sm font-semibold text-brand-700 underline"
                    >
                      Submit another request →
                    </Link>
                  </div>
                </>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
