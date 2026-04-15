"use client";

import { useEffect, useRef, useState } from "react";

export function Menu({
  trigger,
  children,
  align = "right",
  width = 200,
}: {
  trigger: (open: boolean) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onEsc);
    }
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="outline-none"
      >
        {trigger(open)}
      </button>
      {open && (
        <div
          style={{ width, [align]: 0 } as any}
          className="absolute z-50 mt-1 overflow-hidden rounded-md border border-ink-200 bg-white py-1 shadow-overlay animate-scale-in"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  onClick,
  children,
  tone = "default",
  disabled,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm disabled:opacity-50 ${
        tone === "danger"
          ? "text-danger-600 hover:bg-danger-50"
          : "text-ink-800 hover:bg-ink-50"
      }`}
    >
      {children}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-ink-100" />;
}
