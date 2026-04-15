"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, User } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api<User>("/auth/me")
      .then(() => router.replace("/teams"))
      .catch(() => router.replace("/login"));
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-purple-50">
      <div className="flex flex-col items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-card">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.95" />
            <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.75" />
            <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
            <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.85" />
          </svg>
        </span>
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
      </div>
    </main>
  );
}
