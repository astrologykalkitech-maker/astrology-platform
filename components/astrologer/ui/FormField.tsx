"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

type FormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string | null;
  hint?: string;
  trailing?: ReactNode;
};

export function FormField({
  label,
  error,
  hint,
  trailing,
  className = "",
  ...rest
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const showHint = Boolean(hint) && !error;
  const describedBy =
    [error ? errorId : null, showHint ? hintId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-midnight">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          suppressHydrationWarning
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={`h-11 w-full rounded-xl border bg-ivory/70 px-3.5 text-sm text-ink transition-all placeholder:text-muted/70 focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-gold focus-visible:shadow-[0_0_0_4px_rgba(197,138,43,0.15)] ${
            error ? "border-red-400" : "border-line hover:border-gold/50"
          } ${trailing ? "pr-12" : ""} ${className}`}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</div>
        )}
      </div>
      {showHint && (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
