type LogoProps = {
  tone?: "light" | "dark";
  showTagline?: boolean;
  tagline?: string;
};

const pt = (r: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return `${(24 + r * Math.cos(a)).toFixed(2)},${(24 + r * Math.sin(a)).toFixed(2)}`;
};
const star = (outer: number, inner: number) =>
  Array.from({ length: 16 }, (_, i) => pt(i % 2 === 0 ? outer : inner, -90 + i * 22.5)).join(" ");

/** Emblem: eight-pointed celestial star inside a lotus ring. */
function Emblem({ light }: { light: boolean }) {
  const line = light ? "#E8D4A6" : "#8A6420";
  return (
    <svg viewBox="0 0 48 48" className="h-10 w-10 shrink-0" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="none" stroke={line} strokeWidth="0.8" strokeOpacity="0.7" />
      {Array.from({ length: 8 }, (_, i) => (
        <ellipse key={i} cx="24" cy="7.5" rx="2.6" ry="4.6" transform={`rotate(${i * 45} 24 24)`} fill="none" stroke={line} strokeWidth="0.9" />
      ))}
      <polygon points={star(13, 6.2)} fill="#C49A4A" fillOpacity="0.28" stroke="#C49A4A" strokeWidth="1.1" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="3" fill="#C49A4A" />
      <circle cx="24" cy="24" r="1.2" fill={light ? "#151027" : "#FFFCF6"} />
    </svg>
  );
}

export function Logo({ tone = "light", showTagline = true, tagline = "Bridging Wisdom, Connecting Lives" }: LogoProps) {
  const isLight = tone === "light";

  return (
    <span className="inline-flex items-center gap-3">
      <Emblem light={isLight} />
      <span className="flex flex-col leading-tight">
        <span className={`font-display text-xl font-semibold tracking-wide ${isLight ? "text-champagne" : "text-midnight"}`}>
          JyotishSetu
        </span>
        {showTagline && (
          <span className={`text-[10px] tracking-wide max-[360px]:hidden ${isLight ? "text-ivory/65" : "text-muted"}`}>
            {tagline}
          </span>
        )}
      </span>
    </span>
  );
}
