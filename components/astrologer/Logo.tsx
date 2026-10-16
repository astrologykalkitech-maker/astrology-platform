type LogoProps = {
  tone?: "light" | "dark";
  showTagline?: boolean;
};

const RAYS = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  return {
    x1: (24 + 13 * Math.cos(angle)).toFixed(2),
    y1: (24 + 13 * Math.sin(angle)).toFixed(2),
    x2: (24 + 20 * Math.cos(angle)).toFixed(2),
    y2: (24 + 20 * Math.sin(angle)).toFixed(2),
  };
});

export function Logo({ tone = "light", showTagline = true }: LogoProps) {
  const isLight = tone === "light";

  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 48 48" className="h-9 w-9 shrink-0" aria-hidden="true">
        <circle
          cx="24"
          cy="24"
          r="9"
          fill="none"
          stroke={isLight ? "#E8C77E" : "#C58A2B"}
          strokeWidth="2"
        />
        <circle cx="24" cy="24" r="4.5" fill="#C58A2B" />
        {RAYS.map((ray, i) => (
          <line
            key={i}
            {...ray}
            stroke={isLight ? "#E8C77E" : "#C58A2B"}
            strokeWidth="2"
            strokeLinecap="round"
          />
        ))}
      </svg>
      <span className="flex flex-col leading-tight">
        <span
          className={`font-display text-xl font-semibold tracking-wide ${
            isLight ? "text-champagne" : "text-midnight"
          }`}
        >
          JyotishSetu
        </span>
        {showTagline && (
          <span className={`text-[10px] tracking-wide ${isLight ? "text-ivory/60" : "text-muted"}`}>
            Bridging Wisdom, Connecting Lives
          </span>
        )}
      </span>
    </span>
  );
}
