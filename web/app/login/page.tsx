"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { api, API_BASE } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";

interface OIDCConfigResp {
  enabled: boolean;
  provider_name?: string;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params?.get("next") || "/teams";
  const ssoError = params?.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(ssoError);
  const [busy, setBusy] = useState(false);
  const [oidc, setOidc] = useState<OIDCConfigResp | null>(null);

  useEffect(() => {
    api<OIDCConfigResp>("/auth/oidc/config")
      .then(setOidc)
      .catch(() => setOidc({ enabled: false }));
  }, []);

  const ssoHref = `${API_BASE}/api/v1/auth/oidc/login?next=${encodeURIComponent(next)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push(next);
    } catch (e: any) {
      setErr(e.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Email">
        <Input
          type="email"
          required
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
        />
      </Field>
      <Field label="Password">
        <Input
          type="password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      {err && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {err}
        </div>
      )}
      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={busy}
        className="w-full"
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      {oidc?.enabled && (
        <>
          <div className="relative my-2 flex items-center">
            <div className="flex-grow border-t border-ink-200" />
            <span className="mx-3 text-xs uppercase tracking-wide text-ink-500">or</span>
            <div className="flex-grow border-t border-ink-200" />
          </div>
          <a
            href={ssoHref}
            className="flex h-11 w-full items-center justify-center rounded-md border border-ink-200 bg-white px-4 text-sm font-medium text-ink-900 shadow-sm hover:bg-ink-50"
          >
            Sign in with {oidc.provider_name || "SSO"}
          </a>
        </>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-brand-50 via-white to-purple-50 px-4 py-12">
      {/* Decorative blurs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-20 top-1/4 h-72 w-72 rounded-full bg-brand-200/50 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-1/4 h-72 w-72 rounded-full bg-purple-200/40 blur-3xl"
      />

      <div className="relative w-full max-w-[400px]">
        {/* Brand */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-card">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.95" />
              <rect x="13" y="3" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.75" />
              <rect x="3" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.55" />
              <rect x="13" y="13" width="8" height="8" rx="1.5" fill="currentColor" opacity="0.85" />
            </svg>
          </span>
          <span className="text-xl font-semibold tracking-tight text-ink-900">Backlog</span>
        </div>

        {/* Card */}
        <div className="surface p-6 shadow-card">
          <div className="mb-5 text-center">
            <h1 className="text-lg font-semibold text-ink-900">Sign in to continue</h1>
            <p className="mt-1 text-sm text-ink-600">
              Track work, plan sprints, and ship together.
            </p>
          </div>

          <Suspense
            fallback={
              <div className="flex justify-center py-8">
                <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
              </div>
            }
          >
            <LoginForm />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-xs text-ink-500">
          Need an account? Ask a server admin to invite you.
        </p>
      </div>
    </main>
  );
}
