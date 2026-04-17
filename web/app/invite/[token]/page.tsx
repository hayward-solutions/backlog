"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";

type State = "accepting" | "error";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<State>("accepting");
  const [msg, setMsg] = useState("Accepting invite…");

  useEffect(() => {
    (async () => {
      try {
        await api("/auth/me");
      } catch {
        router.replace(`/login?next=/invite/${token}`);
        return;
      }
      try {
        const r = await api<{ team_id: string }>(`/invites/${token}/accept`, {
          method: "POST",
        });
        router.replace(`/teams/${r.team_id}`);
      } catch (e: any) {
        setState("error");
        setMsg(e?.message || "We couldn't accept this invite.");
      }
    })();
  }, [token, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-ink-0 to-purple-50 px-4">
      <div className="w-full max-w-[400px] surface p-6 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.95" />
            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.75" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.85" />
          </svg>
        </div>
        {state === "accepting" ? (
          <>
            <h1 className="text-base font-semibold text-ink-900">Joining team…</h1>
            <p className="mt-1 text-sm text-ink-600">{msg}</p>
            <div className="mt-4 flex justify-center">
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-base font-semibold text-ink-900">Invite problem</h1>
            <p className="mt-1 text-sm text-danger-600">{msg}</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="secondary" onClick={() => router.push("/teams")}>
                Go to teams
              </Button>
              <Button variant="primary" onClick={() => router.push("/login")}>
                Sign in
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
