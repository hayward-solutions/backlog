type Tone = "neutral" | "blue" | "green" | "amber" | "red" | "purple" | "teal" | "magenta";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  blue: "bg-brand-50 text-brand-700",
  green: "bg-success-50 text-success-700",
  amber: "bg-warning-50 text-warning-700",
  red: "bg-danger-50 text-danger-700",
  purple: "bg-purple-50 text-purple-700",
  teal: "bg-teal-50 text-teal-600",
  magenta: "bg-magenta-50 text-magenta-600",
};

const tonesBold: Record<Tone, string> = {
  neutral: "bg-ink-700 text-white",
  blue: "bg-brand-600 text-white",
  green: "bg-success-600 text-white",
  amber: "bg-warning-600 text-white",
  red: "bg-danger-600 text-white",
  purple: "bg-purple-600 text-white",
  teal: "bg-teal-600 text-white",
  magenta: "bg-magenta-600 text-white",
};

export function Badge({
  tone = "neutral",
  bold = false,
  children,
  className = "",
  title,
}: {
  tone?: Tone;
  bold?: boolean;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const style = bold ? tonesBold[tone] : tones[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${style} ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/** Pick the readable text/background pair for a custom label color (hex). */
export function LabelPill({
  name,
  color,
  selected = true,
  className = "",
  onClick,
}: {
  name: string;
  color: string;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide transition ${
        clickable ? "cursor-pointer" : ""
      } ${className}`.trim()}
      style={
        selected
          ? { background: color, color: "#fff" }
          : {
              background: "transparent",
              color,
              boxShadow: `inset 0 0 0 1px ${color}`,
            }
      }
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: selected ? "rgba(255,255,255,0.8)" : color,
        }}
      />
      {name}
    </span>
  );
}

export function StatusPill({
  type,
  children,
}: {
  type: "todo" | "in_progress" | "done";
  children?: React.ReactNode;
}) {
  const tone: Tone =
    type === "done" ? "green" : type === "in_progress" ? "blue" : "neutral";
  return <Badge tone={tone}>{children ?? type.replace("_", " ")}</Badge>;
}
