"use client";

import React, { memo } from "react";
import { ArrowDown } from "lucide-react";

interface NewMessagesPillProps {
  count: number;
  onClick: () => void;
}

export const NewMessagesPill = memo(function NewMessagesPill({
  count,
  onClick,
}: NewMessagesPillProps) {
  if (count <= 0) return null;

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-20">
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-midnight text-champagne border border-gold/40 shadow-xl text-xs font-semibold hover:bg-slate-900 transition-all animate-bounce cursor-pointer"
      >
        <span>{count} new message{count > 1 ? "s" : ""}</span>
        <ArrowDown className="h-3.5 w-3.5 text-gold" />
      </button>
    </div>
  );
});

