"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  api,
  Priority,
  RequestFieldType,
  RequestTemplate,
  RequestTemplateField,
} from "@/lib/api";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import {
  IconArrowDown,
  IconArrowUp,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";

/**
 * Self-contained templates CRUD UI for a service desk board. Owns its own
 * queries/mutations so it can be dropped into any page that has the board
 * id — currently used on the dedicated /templates route.
 */
export function TemplatesEditor({ boardId }: { boardId: string }) {
  const qc = useQueryClient();

  const templates = useQuery({
    queryKey: ["templates", boardId],
    queryFn: () =>
      api<RequestTemplate[]>(`/boards/${boardId}/request-templates`),
  });

  const createTemplate = useMutation({
    mutationFn: (body: { name: string; description: string }) =>
      api<RequestTemplate>(`/boards/${boardId}/request-templates`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const updateTemplate = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: {
        name?: string;
        description?: string;
        default_priority?: Priority;
        archived?: boolean;
      };
    }) =>
      api<RequestTemplate>(`/request-templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) =>
      api(`/request-templates/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const createField = useMutation({
    mutationFn: ({
      templateId,
      body,
    }: {
      templateId: string;
      body: {
        key: string;
        label: string;
        type: RequestFieldType;
        required: boolean;
        position: number;
        options: string[];
        help_text: string;
      };
    }) =>
      api<RequestTemplateField>(
        `/request-templates/${templateId}/fields`,
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const updateField = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<{
        key: string;
        label: string;
        type: RequestFieldType;
        required: boolean;
        position: number;
        options: string[];
        help_text: string;
      }>;
    }) =>
      api<RequestTemplateField>(`/request-fields/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const deleteField = useMutation({
    mutationFn: (id: string) =>
      api(`/request-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates", boardId] }),
    onError: (e: Error) => alert(e.message),
  });

  const [newTemplateName, setNewTemplateName] = useState("");
  const list = templates.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-900">
            Request templates
          </h2>
          <p className="mt-0.5 text-xs text-ink-500">
            Each template becomes a choice on the intake form. Fields are
            filled in by the submitter.
          </p>
        </div>
        <span className="text-xs text-ink-500">
          {list.length} template{list.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="mt-4 space-y-3">
        {list.map((t) => (
          <TemplateEditor
            key={t.id}
            template={t}
            onUpdate={(patch) => updateTemplate.mutate({ id: t.id, patch })}
            onDelete={() => {
              if (confirm(`Delete template "${t.name}"?`))
                deleteTemplate.mutate(t.id);
            }}
            onCreateField={(body) =>
              createField.mutate({ templateId: t.id, body })
            }
            onUpdateField={(id, patch) => updateField.mutate({ id, patch })}
            onDeleteField={(id) => deleteField.mutate(id)}
          />
        ))}
        {list.length === 0 && !templates.isLoading && (
          <li className="rounded-md border border-dashed border-ink-200 px-4 py-6 text-center text-xs text-ink-500">
            No templates yet — add one below.
          </li>
        )}
      </ul>

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = newTemplateName.trim();
          if (!v) return;
          createTemplate.mutate({ name: v, description: "" });
          setNewTemplateName("");
        }}
      >
        <Input
          value={newTemplateName}
          onChange={(e) => setNewTemplateName(e.target.value)}
          placeholder="New template name (e.g. Bug report)"
          className="flex-1"
        />
        <Button type="submit" variant="primary" disabled={!newTemplateName.trim()}>
          <IconPlus size={14} /> Add template
        </Button>
      </form>
    </div>
  );
}

function TemplateEditor({
  template,
  onUpdate,
  onDelete,
  onCreateField,
  onUpdateField,
  onDeleteField,
}: {
  template: RequestTemplate;
  onUpdate: (patch: {
    name?: string;
    description?: string;
    default_priority?: Priority;
    archived?: boolean;
  }) => void;
  onDelete: () => void;
  onCreateField: (body: {
    key: string;
    label: string;
    type: RequestFieldType;
    required: boolean;
    position: number;
    options: string[];
    help_text: string;
  }) => void;
  onUpdateField: (
    id: string,
    patch: Partial<{
      key: string;
      label: string;
      type: RequestFieldType;
      required: boolean;
      position: number;
      options: string[];
      help_text: string;
    }>
  ) => void;
  onDeleteField: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] =
    useState<RequestFieldType>("text");
  const [newFieldRequired, setNewFieldRequired] = useState(false);

  const fields = [...template.fields].sort((a, b) => a.position - b.position);

  const slugifyKey = (label: string) =>
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "field";

  return (
    <li className="rounded-md border border-ink-200">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <Input
          defaultValue={template.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== template.name) onUpdate({ name: v });
          }}
          className="min-w-[180px] flex-1"
        />
        <Select
          value={template.default_priority}
          onChange={(e) =>
            onUpdate({ default_priority: e.target.value as Priority })
          }
          className="w-28"
          title="Default priority for submissions"
        >
          <option value="low">Low</option>
          <option value="med">Med</option>
          <option value="high">High</option>
          <option value="urgent">Urgent</option>
        </Select>
        {template.archived_at && <Badge tone="amber">Archived</Badge>}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide fields" : `Edit fields (${fields.length})`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onUpdate({ archived: !template.archived_at })}
        >
          {template.archived_at ? "Unarchive" : "Archive"}
        </Button>
        <Button variant="danger" size="sm" onClick={onDelete}>
          <IconTrash size={12} />
        </Button>
      </div>

      {expanded && (
        <div className="border-t border-ink-100 bg-ink-50/50 p-3">
          <Field label="Description shown on the form">
            <Textarea
              defaultValue={template.description}
              rows={2}
              onBlur={(e) => {
                const v = e.target.value;
                if (v !== template.description) onUpdate({ description: v });
              }}
            />
          </Field>

          <ul className="mt-3 space-y-2">
            {fields.map((f, idx) => (
              <FieldEditor
                key={f.id}
                field={f}
                canMoveUp={idx > 0}
                canMoveDown={idx < fields.length - 1}
                onUpdate={(patch) => onUpdateField(f.id, patch)}
                onDelete={() => {
                  if (confirm(`Delete field "${f.label}"?`))
                    onDeleteField(f.id);
                }}
                onMoveUp={() => {
                  const prev = fields[idx - 1];
                  const prevPrev = fields[idx - 2];
                  const newPos = prevPrev
                    ? (prevPrev.position + prev.position) / 2
                    : prev.position - 1;
                  onUpdateField(f.id, { position: newPos });
                }}
                onMoveDown={() => {
                  const next = fields[idx + 1];
                  const nextNext = fields[idx + 2];
                  const newPos = nextNext
                    ? (next.position + nextNext.position) / 2
                    : next.position + 1;
                  onUpdateField(f.id, { position: newPos });
                }}
              />
            ))}
            {fields.length === 0 && (
              <li className="rounded-md border border-dashed border-ink-200 px-3 py-3 text-center text-xs text-ink-500">
                No fields yet.
              </li>
            )}
          </ul>

          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const label = newFieldLabel.trim();
              if (!label) return;
              const lastPos = fields[fields.length - 1]?.position ?? 0;
              onCreateField({
                key: slugifyKey(label),
                label,
                type: newFieldType,
                required: newFieldRequired,
                position: lastPos + 1,
                options: newFieldType === "select" ? [] : [],
                help_text: "",
              });
              setNewFieldLabel("");
              setNewFieldRequired(false);
            }}
          >
            <Field label="New field label" className="min-w-[180px] flex-1">
              <Input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g. Steps to reproduce"
              />
            </Field>
            <Field label="Type">
              <Select
                value={newFieldType}
                onChange={(e) =>
                  setNewFieldType(e.target.value as RequestFieldType)
                }
                className="w-32"
              >
                <option value="text">Short text</option>
                <option value="longtext">Long text</option>
                <option value="select">Dropdown</option>
                <option value="email">Email</option>
                <option value="url">URL</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
              </Select>
            </Field>
            <label className="flex items-center gap-1 text-xs text-ink-700">
              <input
                type="checkbox"
                checked={newFieldRequired}
                onChange={(e) => setNewFieldRequired(e.target.checked)}
              />
              Required
            </label>
            <Button
              variant="primary"
              type="submit"
              disabled={!newFieldLabel.trim()}
            >
              <IconPlus size={12} /> Add field
            </Button>
          </form>
        </div>
      )}
    </li>
  );
}

function FieldEditor({
  field,
  canMoveUp,
  canMoveDown,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  field: RequestTemplateField;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onUpdate: (
    patch: Partial<{
      key: string;
      label: string;
      type: RequestFieldType;
      required: boolean;
      position: number;
      options: string[];
      help_text: string;
    }>
  ) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [optionsDraft, setOptionsDraft] = useState(field.options.join("\n"));

  return (
    <li className="rounded-md border border-ink-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-col">
          <button
            type="button"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            className="text-ink-500 hover:text-ink-800 disabled:opacity-30"
            title="Move up"
          >
            <IconArrowUp size={12} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            className="text-ink-500 hover:text-ink-800 disabled:opacity-30"
            title="Move down"
          >
            <IconArrowDown size={12} strokeWidth={2.5} />
          </button>
        </div>
        <Input
          defaultValue={field.label}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== field.label) onUpdate({ label: v });
          }}
          className="min-w-[160px] flex-1"
          placeholder="Label"
        />
        <Input
          defaultValue={field.key}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== field.key) onUpdate({ key: v });
          }}
          className="w-32 font-mono"
          placeholder="key"
          title="Field key — stored with each submission"
        />
        <Select
          value={field.type}
          onChange={(e) =>
            onUpdate({ type: e.target.value as RequestFieldType })
          }
          className="w-32"
        >
          <option value="text">Short text</option>
          <option value="longtext">Long text</option>
          <option value="select">Dropdown</option>
          <option value="email">Email</option>
          <option value="url">URL</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
        </Select>
        <label className="flex items-center gap-1 text-xs text-ink-700">
          <input
            type="checkbox"
            defaultChecked={field.required}
            onChange={(e) => onUpdate({ required: e.target.checked })}
          />
          Required
        </label>
        <Button variant="danger" size="sm" onClick={onDelete}>
          <IconTrash size={12} />
        </Button>
      </div>
      <Input
        defaultValue={field.help_text}
        onBlur={(e) => {
          const v = e.target.value;
          if (v !== field.help_text) onUpdate({ help_text: v });
        }}
        placeholder="Help text shown under the field (optional)"
        className="mt-2"
      />
      {field.type === "select" && (
        <div className="mt-2">
          <Textarea
            rows={3}
            value={optionsDraft}
            onChange={(e) => setOptionsDraft(e.target.value)}
            onBlur={() => {
              const next = optionsDraft
                .split("\n")
                .map((s) => s.trim())
                .filter(Boolean);
              const same =
                next.length === field.options.length &&
                next.every((v, i) => v === field.options[i]);
              if (!same) onUpdate({ options: next });
            }}
            placeholder="One option per line"
          />
        </div>
      )}
    </li>
  );
}
