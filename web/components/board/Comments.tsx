"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, Comment, Member } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Input";
import { Avatar } from "@/components/ui/Avatar";
import { IconTrash } from "@/components/ui/icons";
import { Markdown } from "@/components/ui/Markdown";

export function Comments({
  taskId,
  teamId,
  currentUserId,
  canComment,
}: {
  taskId: string;
  teamId: string;
  currentUserId: string;
  canComment: boolean;
}) {
  const qc = useQueryClient();
  const key = ["comments", taskId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<Comment[]>(`/tasks/${taskId}/comments`),
  });
  const members = useQuery({
    queryKey: ["members", teamId],
    queryFn: () => api<Member[]>(`/teams/${teamId}/members`),
  });

  const [body, setBody] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api<Comment>(`/tasks/${taskId}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["events", taskId] });
    },
    onError: (e: Error) => alert(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/comments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const memberName = (id: string) =>
    members.data?.find((m) => m.user.id === id)?.user.display_name || "Unknown";

  return (
    <section>
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
        Comments
      </h3>
      <ul className="space-y-3">
        {(q.data ?? []).map((c) => (
          <li key={c.id} className="flex gap-2">
            <Avatar name={memberName(c.author_id)} seed={c.author_id} size={24} />
            <div className="flex-1 rounded-md border border-ink-200 bg-white px-3 py-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="text-xs">
                  <span className="font-medium text-ink-800">
                    {memberName(c.author_id)}
                  </span>
                  <span className="ml-2 text-ink-500">
                    {new Date(c.created_at).toLocaleString()}
                    {c.edited_at && " (edited)"}
                  </span>
                </div>
                {c.author_id === currentUserId && (
                  <button
                    className="rounded-xs p-1 text-ink-500 hover:bg-danger-50 hover:text-danger-600"
                    title="Delete"
                    onClick={() => {
                      if (confirm("Delete this comment?")) del.mutate(c.id);
                    }}
                  >
                    <IconTrash size={13} />
                  </button>
                )}
              </div>
              <Markdown source={c.body} />
            </div>
          </li>
        ))}
        {(q.data ?? []).length === 0 && (
          <li className="text-xs text-ink-500">No comments yet.</li>
        )}
      </ul>

      {canComment && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim() && !create.isPending) create.mutate();
          }}
        >
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Add a comment… (markdown supported)"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={!body.trim() || create.isPending}
            >
              {create.isPending ? "Posting…" : "Comment"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
