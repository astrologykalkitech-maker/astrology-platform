export function CompletionRing({ percent, dark = false }: { percent: number; dark?: boolean }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0" role="img" aria-label={`Profile ${percent}% complete`}>
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke={dark ? "rgba(232,212,166,0.2)" : "#f7f0e3"} strokeWidth="9" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke="#C49A4A" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (c * percent) / 100}
        />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-display text-lg font-semibold lining-nums tabular-nums ${dark ? "text-champagne" : "text-midnight"}`}>
        {percent}%
      </span>
    </div>
  );
}
