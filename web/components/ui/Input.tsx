import {
  forwardRef,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...rest }, ref) {
    return <input ref={ref} className={`control w-full ${className}`.trim()} {...rest} />;
  }
);

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className = "", children, ...rest }, ref) {
  return (
    <select ref={ref} className={`control ${className}`.trim()} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className = "", rows = 4, ...rest }, ref) {
  return (
    <textarea ref={ref} rows={rows} className={`control w-full ${className}`.trim()} {...rest} />
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`.trim()}>
      {label && (
        <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-700">
          {label}
        </span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger-600">{error}</span>}
    </label>
  );
}
