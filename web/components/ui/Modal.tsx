"use client";

import { useEffect } from "react";
import { IconClose } from "./icons";

export function Modal({
  title,
  onClose,
  children,
  width = 640,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div
        className="absolute inset-0 bg-ink-900/50 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 flex max-h-[min(90vh,800px)] w-full flex-col overflow-hidden rounded-lg bg-white shadow-overlay animate-scale-in"
        style={{ maxWidth: width }}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-ink-200 px-5 py-3">
          <h2 className="text-base font-semibold text-ink-900">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-xs p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
            aria-label="Close"
          >
            <IconClose size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-ink-200 bg-ink-50 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  subtitle,
  onClose,
  children,
  width = 520,
  actions,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  actions?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in">
      <div className="flex-1 bg-ink-900/40 backdrop-blur-[1px]" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        className="flex h-full flex-col overflow-hidden bg-white shadow-drawer animate-slide-in-right"
        style={{ width, maxWidth: "100vw" }}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-ink-200 px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 truncate text-xs text-ink-600">{subtitle}</div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {actions}
            <button
              onClick={onClose}
              className="rounded-xs p-1 text-ink-500 hover:bg-ink-100 hover:text-ink-900"
              aria-label="Close"
            >
              <IconClose size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}
