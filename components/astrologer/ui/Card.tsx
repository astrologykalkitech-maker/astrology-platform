import type { HTMLAttributes } from "react";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-line bg-white text-ink shadow-[0_10px_30px_-20px_rgba(33,22,49,0.35)] ${className}`}
      {...rest}
    />
  );
}
