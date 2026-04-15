"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/TopBar";
import { api, User } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

export default function AccountPage() {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<User>("/auth/me"),
  });

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [profileMsg, setProfileMsg] = useState<{
    tone: "ok" | "err";
    text: string;
  } | null>(null);

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
        body: JSON.stringify({ display_name: displayName.trim(), email: email.trim() }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      setProfileMsg({ tone: "ok", text: "Profile saved." });
      setTimeout(() => setProfileMsg(null), 2500);
    },
    onError: (e: Error) => setProfileMsg({ tone: "err", text: e.message }),
  });

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  const [pwMsg, setPwMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

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
      setPwMsg({ tone: "ok", text: "Password changed." });
      setTimeout(() => setPwMsg(null), 2500);
    },
    onError: (e: Error) => setPwMsg({ tone: "err", text: e.message }),
  });

  const displayLabel = me.data?.display_name || me.data?.email || "Account";

  return (
    <AppShell
      topSlot={
        <Breadcrumbs items={[{ label: "Teams", href: "/teams" }, { label: "My account" }]} />
      }
    >
      <div className="border-b border-ink-200 bg-white px-4 py-4 sm:px-6">
        <h1 className="text-[20px] font-semibold tracking-tight text-ink-900">My account</h1>
        <p className="text-sm text-ink-600">Manage your profile and password.</p>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Identity card */}
          <section className="surface flex items-center gap-4 p-5">
            <Avatar name={displayLabel} seed={me.data?.id ?? displayLabel} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-semibold text-ink-900">
                  {displayLabel}
                </span>
                {me.data?.is_system_admin && (
                  <Badge tone="purple" bold>
                    Server admin
                  </Badge>
                )}
              </div>
              <div className="truncate text-sm text-ink-600">{me.data?.email}</div>
              {me.data && (
                <div className="mt-1 text-xs text-ink-500">
                  Joined {new Date(me.data.created_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </section>

          {/* Profile */}
          <section className="surface p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-ink-900">Profile</h2>
              <p className="text-xs text-ink-500">
                Your display name is shown on cards, comments, and activity.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveProfile.mutate();
              }}
            >
              <Field label="Display name">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              {profileMsg && (
                <div
                  className={`rounded-md px-3 py-2 text-sm ${
                    profileMsg.tone === "ok"
                      ? "border border-success-200 bg-success-50 text-success-700"
                      : "border border-danger-200 bg-danger-50 text-danger-700"
                  }`}
                >
                  {profileMsg.text}
                </div>
              )}
              <div>
                <Button type="submit" variant="primary" disabled={saveProfile.isPending}>
                  {saveProfile.isPending ? "Saving…" : "Save changes"}
                </Button>
              </div>
            </form>
          </section>

          {/* Password */}
          <section className="surface p-5">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-ink-900">Change password</h2>
              <p className="text-xs text-ink-500">
                Must be at least 8 characters. You'll stay signed in on this device.
              </p>
            </div>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (newPw.length < 8) {
                  setPwMsg({ tone: "err", text: "New password must be at least 8 characters." });
                  return;
                }
                if (newPw !== newPw2) {
                  setPwMsg({ tone: "err", text: "New passwords don't match." });
                  return;
                }
                changePw.mutate();
              }}
            >
              <Field label="Current password">
                <Input
                  type="password"
                  required
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                />
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="New password">
                  <Input
                    type="password"
                    required
                    value={newPw}
                    onChange={(e) => setNewPw(e.target.value)}
                  />
                </Field>
                <Field label="Confirm new password">
                  <Input
                    type="password"
                    required
                    value={newPw2}
                    onChange={(e) => setNewPw2(e.target.value)}
                  />
                </Field>
              </div>
              {pwMsg && (
                <div
                  className={`rounded-md px-3 py-2 text-sm ${
                    pwMsg.tone === "ok"
                      ? "border border-success-200 bg-success-50 text-success-700"
                      : "border border-danger-200 bg-danger-50 text-danger-700"
                  }`}
                >
                  {pwMsg.text}
                </div>
              )}
              <div>
                <Button type="submit" variant="primary" disabled={changePw.isPending}>
                  {changePw.isPending ? "Changing…" : "Change password"}
                </Button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
