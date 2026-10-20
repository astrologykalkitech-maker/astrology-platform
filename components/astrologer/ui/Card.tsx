import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-gold/25 bg-white/95 text-ink shadow-[0_1px_0_rgba(255,255,255,0.8)_inset,0_18px_40px_-24px_rgba(60,35,90,0.45)] backdrop-blur-sm ${className}`}
      {...rest}
    />
  );
}
