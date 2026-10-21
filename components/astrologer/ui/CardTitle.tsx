import type { ReactNode } from "react";

/** Serif section title with a small gold diamond mark. */
export function CardTitle({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`flex items-center gap-2.5 font-display text-xl font-semibold text-midnight ${className}`}>
      <span aria-hidden="true" className="h-2 w-2 shrink-0 rotate-45 bg-gradient-to-br from-champagne to-gold-deep" />
      {children}
    </h2>
  );
}
