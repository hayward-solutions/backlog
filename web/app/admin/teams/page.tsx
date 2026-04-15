"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, Team, User } from "@/lib/api";

export default function AdminTeamsPage() {
  const qc = useQueryClient();
  const teams = useQuery({
    queryKey: ["teams"],
    queryFn: () => api<Team[]>("/teams"),
  });
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => api<User[]>("/admin/users"),
  });

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const createTeam = useMutation({
    mutationFn: () =>
      api<Team>("/admin/teams", {
        method: "POST",
        body: JSON.stringify({ name, slug, owner_id: ownerId || undefined }),
      }),
    onSuccess: () => {
      setName("");
      setSlug("");
      setOwnerId("");
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => alert(e.message),
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Teams</h1>
        <p className="text-sm text-neutral-500">
          All teams on this server. Click a team to manage its members and settings.
        </p>
      </div>

      <section>
        <div className="overflow-hidden rounded border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-600">
              <tr>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Slug</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {(teams.data ?? []).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-neutral-600">{t.slug}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/teams/${t.id}`}
                      className="mr-3 text-xs text-neutral-600 hover:underline"
                    >
                      Open
                    </Link>
                    <Link
                      href={`/teams/${t.id}/settings`}
                      className="text-xs text-neutral-600 hover:underline"
                    >
                      Settings
                    </Link>
                  </td>
                </tr>
              ))}
              {(teams.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-neutral-500">
                    No teams.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTeam.mutate();
          }}
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          <input
            placeholder="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="flex-1 min-w-[160px] rounded border px-3 py-2"
          />
          <input
            placeholder="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="flex-1 min-w-[140px] rounded border px-3 py-2"
          />
          <select
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
            className="min-w-[160px] rounded border px-3 py-2"
          >
            <option value="">(me as owner)</option>
            {(users.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.email}
              </option>
            ))}
          </select>
          <button className="rounded bg-neutral-900 px-4 py-2 text-white">
            Create team
          </button>
        </form>
      </section>
    </main>
  );
}
