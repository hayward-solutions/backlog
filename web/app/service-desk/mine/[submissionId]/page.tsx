"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { ApiError, DeskMessage, DeskTrackingInfo, api } from "@/lib/api";
import { TrackingView } from "@/components/service-desk/TrackingView";

export default function MySubmissionTrackPage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const queryKey = ["desk-mine", submissionId] as const;

  const track = useQuery({
    queryKey,
    queryFn: () =>
      api<DeskTrackingInfo>(`/desks/my-submissions/${submissionId}`),
    retry: false,
    refetchInterval: 30_000,
  });

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:py-14">
        <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-soft">
          <nav className="text-xs text-ink-500">
            <Link href="/service-desk/mine" className="hover:underline">
              ← All my requests
            </Link>
          </nav>

          {track.isLoading && (
            <div className="mt-3 text-sm text-ink-500">Loading…</div>
          )}
          {track.error && (
            <div className="mt-3 rounded-md border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
              {(track.error as ApiError).status === 401
                ? "Sign in to view this request."
                : (track.error as ApiError).status === 404
                ? "We couldn't find that request."
                : (track.error as Error).message ||
                  "We couldn't load this request right now."}
            </div>
          )}
          {track.data && (
            <div className="mt-3">
              <TrackingView
                info={track.data}
                queryKey={queryKey}
                sendReply={(body) =>
                  api<DeskMessage>(
                    `/desks/my-submissions/${submissionId}/messages`,
                    {
                      method: "POST",
                      body: JSON.stringify({ body }),
                    }
                  )
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
