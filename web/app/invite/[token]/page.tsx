"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
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
        const r = await api<{ team_id: string }>(
          `/invites/${token}/accept`,
          { method: "POST" }
        );
        router.replace(`/teams/${r.team_id}`);
      } catch (e: any) {
        setMsg(`Invite error: ${e.message}`);
      }
    })();
  }, [token, router]);

  return (
    <main className="mx-auto max-w-md px-6 py-16 text-neutral-600">{msg}</main>
  );
}
