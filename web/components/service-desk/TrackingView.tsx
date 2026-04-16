"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { DeskMessage, DeskTrackingInfo } from "@/lib/api";
import { StatusPill } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";

/**
 * Renders the submitter-facing status + conversation for a single
 * submission. Used by both the token-based public tracking page and the
 * signed-in /service-desk/mine authenticated view. The only thing the
 * caller needs to supply is how to fetch and how to post a reply.
 */
export interface TrackingViewProps {
  info: DeskTrackingInfo;
  /** React-Query cache key the parent used; we invalidate after posting. */
  queryKey: readonly unknown[];
  /** Fires a "send a reply" request; receives the trimmed body. */
  sendReply: (body: string) => Promise<DeskMessage>;
  /** Optional footer block — e.g. "Submit another request" link. */
  footer?: React.ReactNode;
}

export function TrackingView({
  info,
  queryKey,
  sendReply,
  footer,
}: TrackingViewProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {info.desk.name}
        </div>
        {info.task_key && (
          <span className="rounded-xs bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink-700">
            {info.task_key}
          </span>
        )}
      </div>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">
        {info.title || "Your request"}
      </h1>
      <p className="mt-1 text-sm text-ink-600">
        Submitted{" "}
        {new Date(info.submitted_at).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
        {info.submitter_email ? (
          <>
            {" "}
            by <span className="font-mono">{info.submitter_email}</span>
          </>
        ) : null}
        .
      </p>

      <div className="mt-6 rounded-md border border-ink-200 bg-ink-50 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          Current status
        </div>
        <div className="mt-2 flex items-center gap-2">
          <StatusPill type={info.status_kind}>{info.status}</StatusPill>
          {info.completed && (
            <span className="text-xs text-success-700">Resolved</span>
          )}
        </div>
      </div>

      {info.values && Object.keys(info.values).length > 0 && (
        <section className="mt-6">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
            What you submitted
          </h2>
          <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 rounded-md border border-ink-200 bg-white p-3 text-sm">
            {Object.entries(info.values).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold text-ink-600">{k}</dt>
                <dd className="whitespace-pre-wrap break-words text-ink-800">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
          Conversation
        </h2>
        <Thread messages={info.messages} />
        <ReplyForm queryKey={queryKey} sendReply={sendReply} />
      </section>

      {footer ? <div className="mt-6">{footer}</div> : null}
    </>
  );
}

function Thread({ messages }: { messages: DeskMessage[] }) {
  if (!messages.length) {
    return (
      <p className="mt-2 rounded-md border border-dashed border-ink-200 p-4 text-center text-xs italic text-ink-500">
        No messages yet. Post a reply below if you&apos;d like to add more
        detail.
      </p>
    );
  }
  return (
    <ul className="mt-2 space-y-2">
      {messages.map((m) => (
        <li
          key={m.id}
          className={
            m.from_submitter
              ? "ml-6 rounded-md border border-brand-200 bg-brand-50 p-3 text-sm"
              : "mr-6 rounded-md border border-ink-200 bg-white p-3 text-sm"
          }
        >
          <div className="flex items-center justify-between gap-2 text-[11px] text-ink-500">
            <span className="font-semibold text-ink-700">
              {m.from_submitter ? "You" : m.author_name || "Team"}
            </span>
            <span>{new Date(m.created_at).toLocaleString()}</span>
          </div>
          <div className="mt-1 whitespace-pre-wrap break-words text-ink-800">
            {m.body}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ReplyForm({
  queryKey,
  sendReply,
}: {
  queryKey: readonly unknown[];
  sendReply: (body: string) => Promise<DeskMessage>;
}) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const send = useMutation({
    mutationFn: (b: string) => sendReply(b),
    onSuccess: () => {
      setBody("");
      setErr(null);
      qc.invalidateQueries({ queryKey });
    },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = body.trim();
        if (!trimmed || send.isPending) return;
        send.mutate(trimmed);
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a reply or more details…"
      />
      {err && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-2 py-1 text-xs text-danger-700">
          {err}
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!body.trim() || send.isPending}
        >
          {send.isPending ? "Sending…" : "Send reply"}
        </Button>
      </div>
    </form>
  );
}
