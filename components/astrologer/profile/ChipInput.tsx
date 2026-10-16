"use client";

import { useId, useState } from "react";
import { X } from "lucide-react";

type Props = { label: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string; max?: number };

export function ChipInput({ label, values, onChange, placeholder, max = 20 }: Props) {
  const id = useId();
  const [draft, setDraft] = useState("");

  function add(raw: string) {
    const v = raw.trim().slice(0, 50);
    if (!v || values.length >= max || values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-midnight">{label}</label>
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-line bg-ivory/70 px-2.5 py-2 focus-within:outline-2 focus-within:outline-gold">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-parchment px-2.5 py-1 text-xs font-medium text-gold-deep">
            {v}
            <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Remove ${v}`} className="rounded hover:bg-gold/20">
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(draft); }
            else if (e.key === "Backspace" && !draft && values.length) onChange(values.slice(0, -1));
          }}
          onBlur={() => add(draft)}
          placeholder={values.length ? "" : placeholder}
          className="min-w-[8rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted/70"
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">Press Enter or comma to add.</p>
    </div>
  );
}
