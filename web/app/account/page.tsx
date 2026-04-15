"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { api, User } from "@/lib/api";

export default function AccountPage() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (me.data) {
      setDisplayName(me.data.display_name);
      setEmail(me.data.email);
    }
  }, [me.data]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api<User>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ display_name: displayName, email }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      alert("Profile saved.");
    },
    onError: (e: Error) => alert(e.message),
  });

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const changePw = useMutation({
    mutationFn: () =>
      api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPw,
          new_password: newPw,
        }),
      }),
    onSuccess: () => {
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
      alert("Password changed.");
    },
    onError: (e: Error) => alert(e.message),
  });

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-10 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold">My account</h1>
          <p className="text-sm text-neutral-500">
            Manage your profile and password.
          </p>
        </div>

        <section>
          <h2 className="text-lg font-semibold">Profile</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveProfile.mutate();
            }}
          >
            <label className="block text-sm">
              <span className="text-neutral-600">Display name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
                required
              />
            </label>
            <button
              disabled={saveProfile.isPending}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {saveProfile.isPending ? "Saving…" : "Save"}
            </button>
          </form>
        </section>

        <section>
          <h2 className="text-lg font-semibold">Change password</h2>
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (newPw.length < 8) {
                alert("New password must be at least 8 characters.");
                return;
              }
              if (newPw !== newPw2) {
                alert("New passwords don't match.");
                return;
              }
              changePw.mutate();
            }}
          >
            <label className="block text-sm">
              <span className="text-neutral-600">Current password</span>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">New password (8+ chars)</span>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-neutral-600">Confirm new password</span>
              <input
                type="password"
                value={newPw2}
                onChange={(e) => setNewPw2(e.target.value)}
                required
                className="mt-1 w-full rounded border border-neutral-300 px-3 py-2"
              />
            </label>
            <button
              disabled={changePw.isPending}
              className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {changePw.isPending ? "Changing…" : "Change password"}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
