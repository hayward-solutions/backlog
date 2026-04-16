"use client";

import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  RequestTemplate,
  RequestTemplateField,
  publicApi,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";

export interface SubmitResponse {
  tracking_token: string;
  tracking_url: string;
  task_key: string;
}

/**
 * Public intake form for a single template. Used by the
 * /service-desk/[slug]/new/[templateId] route; callers handle the
 * template-picker UI themselves.
 */
export function SubmissionForm({
  slug,
  template,
}: {
  slug: string;
  template: RequestTemplate;
}) {
  const fields = useMemo(
    () => [...template.fields].sort((a, b) => a.position - b.position),
    [template]
  );
  const [values, setValues] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [result, setResult] = useState<SubmitResponse | null>(null);

  const submit = useMutation({
    mutationFn: () =>
      publicApi<SubmitResponse>(`/public/desks/${slug}/submissions`, {
        method: "POST",
        body: JSON.stringify({
          template_id: template.id,
          email,
          name,
          website,
          values,
        }),
      }),
    onSuccess: (r) => setResult(r),
  });

  if (result) {
    return (
      <div className="rounded-md border border-success-200 bg-success-50 p-4">
        <div className="text-sm font-semibold text-success-700">
          Thanks — your request was submitted.
        </div>
        <p className="mt-1 text-sm text-ink-700">
          You can come back to check on its status any time:
        </p>
        <div className="mt-3">
          <Link
            href={result.tracking_url}
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 underline"
          >
            Open tracking page →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit.mutate();
      }}
    >
      {template.description && (
        <p className="rounded-md border border-ink-200 bg-ink-50 p-3 text-sm text-ink-700">
          {template.description}
        </p>
      )}

      <Field label="Your email" hint="Used to send you status updates.">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Your name (optional)">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
        />
      </Field>

      {/* Honeypot — hidden from users, visible to dumb bots. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: "-9999px",
          width: "1px",
          height: "1px",
          overflow: "hidden",
        }}
      >
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      {fields.map((f) => (
        <FieldInput
          key={f.id}
          field={f}
          value={values[f.key] ?? ""}
          onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
        />
      ))}

      {submit.error && (
        <div className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
          {(submit.error as Error).message}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          disabled={submit.isPending || !email.trim()}
        >
          {submit.isPending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: RequestTemplateField;
  value: string;
  onChange: (v: string) => void;
}) {
  const common = {
    required: field.required,
    value,
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >
    ) => onChange(e.target.value),
  };

  return (
    <Field
      label={field.label + (field.required ? " *" : "")}
      hint={field.help_text || undefined}
    >
      {field.type === "longtext" ? (
        <Textarea rows={5} {...common} />
      ) : field.type === "select" ? (
        <Select {...common}>
          <option value="">—</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          type={
            field.type === "email"
              ? "email"
              : field.type === "url"
              ? "url"
              : field.type === "number"
              ? "number"
              : field.type === "date"
              ? "date"
              : "text"
          }
          {...common}
        />
      )}
    </Field>
  );
}

/**
 * Centred card layout used by every public /service-desk page, so the
 * landing, picker and form stay visually consistent.
 */
export function DeskShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
        <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-soft">
          {children}
        </div>
      </div>
    </div>
  );
}
