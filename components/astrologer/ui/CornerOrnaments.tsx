/** Fine gold corner flourishes for light cards. Decorative only. */
function Corner({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className={`pointer-events-none absolute h-7 w-7 text-gold/70 ${className}`} fill="none" stroke="currentColor" strokeWidth="1">
      <path d="M2 46 V14 C2 7 7 2 14 2 H46" />
      <path d="M8 46 V18 C8 12 12 8 18 8 H46" strokeOpacity="0.6" />
      <circle cx="14" cy="14" r="2.5" fill="currentColor" />
      <path d="M20 20 C26 20 28 14 24 11" strokeOpacity="0.7" />
    </svg>
  );
}

export function CornerOrnaments() {
  return (
    <>
      <Corner className="left-1 top-1" />
      <Corner className="right-1 top-1 scale-x-[-1]" />
      <Corner className="bottom-1 left-1 scale-y-[-1]" />
      <Corner className="bottom-1 right-1 scale-[-1]" />
    </>
  );
}
