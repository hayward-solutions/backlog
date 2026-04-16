"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import {
  api,
  Attachment,
  attachmentDownloadURL,
  uploadAttachment,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { IconTrash } from "@/components/ui/icons";

export function Attachments({
  taskId,
  teamId,
  canEdit,
}: {
  taskId: string;
  teamId: string;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const key = ["task-attachments", taskId];
  const q = useQuery({
    queryKey: key,
    queryFn: () => api<Attachment[]>(`/tasks/${taskId}/attachments`),
  });

  const fileInput = useRef<HTMLInputElement>(null);

  const attachExisting = async (att: Attachment) => {
    await api(`/tasks/${taskId}/attachments`, {
      method: "POST",
      body: JSON.stringify({ attachment_id: att.id }),
    });
    qc.invalidateQueries({ queryKey: key });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const att = await uploadAttachment(teamId, file);
      await attachExisting(att);
      return att;
    },
    onError: (e: Error) => alert(e.message),
  });

  const detach = useMutation({
    mutationFn: (id: string) =>
      api(`/tasks/${taskId}/attachments/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return (
    <section>
      <h3 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
        Attachments
      </h3>
      <ul className="space-y-1">
        {(q.data ?? []).map((a) => (
          <li
            key={a.id}
            className="flex items-center justify-between rounded-md border border-ink-200 bg-white px-2 py-1.5 text-sm"
          >
            <AttachmentLine att={a} />
            {canEdit && (
              <button
                onClick={() => detach.mutate(a.id)}
                title="Remove"
                className="rounded-xs p-1 text-ink-500 hover:bg-danger-50 hover:text-danger-600"
              >
                <IconTrash size={14} />
              </button>
            )}
          </li>
        ))}
        {(q.data ?? []).length === 0 && (
          <li className="text-xs text-ink-500">No attachments yet.</li>
        )}
      </ul>

      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
              if (fileInput.current) fileInput.current.value = "";
            }}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? "Uploading…" : "Upload file"}
          </Button>
          <span className="text-xs text-ink-500">Max 25 MB</span>
        </div>
      )}
    </section>
  );
}

function AttachmentLine({ att }: { att: Attachment }) {
  if (att.kind === "file") {
    const href = attachmentDownloadURL(att.id);
    const isImage = (att.content_type || "").startsWith("image/");
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 items-center gap-2 text-brand-600 hover:underline"
      >
        {isImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt="" className="h-8 w-8 rounded object-cover" />
        )}
        <span className="truncate">{att.title || att.filename}</span>
        <span className="ml-1 shrink-0 text-xs text-ink-500">
          {formatSize(att.size_bytes)}
        </span>
      </a>
    );
  }
  // internal
  const href =
    att.target_type === "task"
      ? `#task/${att.target_id}`
      : `/boards/${att.target_id}/tasks`;
  return (
    <a href={href} className="truncate text-brand-600 hover:underline">
      ↪ {att.title || `${att.target_type}:${att.target_id}`}
    </a>
  );
}

function formatSize(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
