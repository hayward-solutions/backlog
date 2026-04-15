"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, Board, Team } from "@/lib/api";

export default function TeamPage() {
  const { teamId } = useParams<{ teamId: string }>();
  const qc = useQueryClient();
  const team = useQuery({
    queryKey: ["team", teamId],
    queryFn: () => api<Team>(`/teams/${teamId}`),
  });
  const boards = useQuery({
    queryKey: ["boards", teamId],
    queryFn: () => api<Board[]>(`/teams/${teamId}/boards`),
  });
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<Board>(`/teams/${teamId}/boards`, {
        method: "POST",
        body: JSON.stringify({ name, description: "" }),
      }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["boards", teamId] });
    },
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{team.data?.name ?? "…"}</h1>
        <Link
          href={`/teams/${teamId}/settings`}
          className="text-sm text-neutral-600 hover:underline"
        >
          Settings →
        </Link>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Boards
        </h2>
        <ul className="mt-3 divide-y rounded border border-neutral-200 bg-white">
          {(boards.data ?? []).map((b) => (
            <li key={b.id}>
              <Link
                href={`/boards/${b.id}`}
                className="block px-4 py-3 hover:bg-neutral-50"
              >
                <div className="font-medium">{b.name}</div>
                {b.description && (
                  <div className="text-xs text-neutral-500">{b.description}</div>
                )}
              </Link>
            </li>
          ))}
          {boards.data?.length === 0 && (
            <li className="px-4 py-6 text-sm text-neutral-500">No boards yet.</li>
          )}
        </ul>

        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <input
            className="flex-1 rounded border border-neutral-300 px-3 py-2"
            placeholder="New board name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            disabled={create.isPending}
            className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-50"
          >
            Create
          </button>
        </form>
        {create.error && (
          <div className="mt-2 text-sm text-red-600">
            {(create.error as Error).message}
          </div>
        )}
      </section>
    </main>
  );
}
