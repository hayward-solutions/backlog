import { IconArrowDown, IconArrowUp, IconArrowUpDouble, IconEquals } from "./icons";
import type { Priority } from "@/lib/api";

const meta: Record<
  Priority,
  { label: string; color: string; Icon: (p: any) => JSX.Element; title: string }
> = {
  low: { label: "Low", color: "#579DFF", Icon: IconArrowDown, title: "Low priority" },
  med: { label: "Medium", color: "#B38600", Icon: IconEquals, title: "Medium priority" },
  high: { label: "High", color: "#E2483D", Icon: IconArrowUp, title: "High priority" },
  urgent: {
    label: "Urgent",
    color: "#AE2A19",
    Icon: IconArrowUpDouble,
    title: "Urgent",
  },
};

export function PriorityIcon({
  priority,
  size = 14,
  withLabel = false,
}: {
  priority: Priority;
  size?: number;
  withLabel?: boolean;
}) {
  const m = meta[priority];
  const { Icon } = m;
  return (
    <span
      title={m.title}
      className="inline-flex items-center gap-1 text-ink-700"
      style={{ color: m.color }}
    >
      <Icon size={size} strokeWidth={2.25} />
      {withLabel && (
        <span className="text-xs font-medium text-ink-700">{m.label}</span>
      )}
    </span>
  );
}

export function priorityLabel(p: Priority) {
  return meta[p].label;
}
