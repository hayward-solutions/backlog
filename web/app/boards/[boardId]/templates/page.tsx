"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { TemplatesEditor } from "@/components/board/TemplatesEditor";
import { api, BoardTree, canManageBoards } from "@/lib/api";

export default function BoardTemplatesPage() {
  const { boardId } = useParams<{ boardId: string }>();

  const query = useQuery({
    queryKey: ["board", boardId],
    queryFn: () => api<BoardTree>(`/boards/${boardId}`),
  });

  if (query.isLoading) {
    return (
      <AppShell boardId={boardId}>
        <div className="flex flex-1 items-center justify-center text-sm text-ink-500">
          Loading…
        </div>
      </AppShell>
    );
  }
  if (query.error) {
    return (
      <AppShell boardId={boardId}>
        <div className="p-6 text-sm text-danger-600">
          {(query.error as Error).message}
        </div>
      </AppShell>
    );
  }

  const tree = query.data!;
  const canManage = canManageBoards(tree.your_role);

  if (!canManage) {
    return (
      <AppShell boardId={boardId} teamId={tree.board.team_id}>
        <div className="p-6 text-sm text-danger-600">
          You don&apos;t have permission to manage this board.
        </div>
      </AppShell>
    );
  }

  if (tree.board.type !== "service_desk") {
    return (
      <AppShell boardId={boardId} teamId={tree.board.team_id}>
        <div className="p-6 text-sm text-ink-600">
          Templates are only available on service desk boards.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      boardId={boardId}
      teamId={tree.board.team_id}
      topSlot={
        <Breadcrumbs
          items={[
            { label: "Teams", href: "/teams" },
            { label: tree.team_name, href: `/teams/${tree.board.team_id}` },
            { label: tree.board.name, href: `/boards/${boardId}` },
            { label: "Templates" },
          ]}
        />
      }
    >
      <div className="border-b border-ink-200 bg-ink-0 px-4 py-4 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">
          Request templates
        </h1>
        <p className="text-sm text-ink-600">
          Configure the forms submitters see on the intake page.
        </p>
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
          <section className="surface p-5">
            <TemplatesEditor boardId={boardId} />
          </section>
        </div>
      </main>
    </AppShell>
  );
}
