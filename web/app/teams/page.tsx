"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, Team } from "@/lib/api";

export default function TeamsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Your teams</h1>
      {isLoading && <p className="mt-4 text-neutral-500">Loading…</p>}
      {error && <p className="mt-4 text-red-600">{(error as Error).message}</p>}
      <ul className="mt-6 divide-y rounded border border-neutral-200 bg-white">
        {(data ?? []).map((t) => (
          <li key={t.id}>
            <Link
              href={`/teams/${t.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-50"
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-neutral-500">{t.slug}</span>
            </Link>
          </li>
        ))}
        {data?.length === 0 && (
          <li className="px-4 py-6 text-sm text-neutral-500">
            You're not in any teams yet. An admin can create one for you.
          </li>
        )}
      </ul>
    </main>
  );
}
