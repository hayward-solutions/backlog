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
    <main className="mx-auto mt-24 max-w-sm px-4 text-neutral-500">
      Loading…
    </main>
  );
}
