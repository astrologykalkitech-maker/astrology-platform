type Props = {
  variant?: "page" | "panel";
  className?: string;
};

// Deterministic pseudo-random so server and client render identical stars.
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const rand = mulberry32(2026);
  return Array.from({ length: 64 }, (_, i) => ({
    x: (rand() * 100).toFixed(2),
    y: (rand() * 100).toFixed(2),
    r: (0.5 + rand() * 1.1).toFixed(2),
    o: (0.25 + rand() * 0.6).toFixed(2),
    twinkle: i % 6 === 0,
  }));
})();

const point = (radius: number, angle: number) => ({
  x: (200 + radius * Math.cos(angle)).toFixed(2),
  y: (200 + radius * Math.sin(angle)).toFixed(2),
});

const SPOKES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i * Math.PI) / 6;
  const a = point(60, angle);
  const b = point(176, angle);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
});

const TICKS = Array.from({ length: 72 }, (_, i) => {
  const angle = (i * Math.PI) / 36;
  const a = point(i % 6 === 0 ? 178 : 183, angle);
  const b = point(190, angle);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
});

const DOTS = Array.from({ length: 12 }, (_, i) => point(148, ((i + 0.5) * Math.PI) / 6));

const CONSTELLATION: [number, number][] = [
  [10, 90],
  [45, 55],
  [80, 70],
  [120, 30],
  [165, 48],
  [190, 15],
];

export function CelestialBackground({ variant = "page", className = "" }: Props) {
  const wheelPosition =
    variant === "page"
      ? "-right-40 -top-40 h-[620px] w-[620px] opacity-[0.16]"
      : "-bottom-24 -left-16 h-[300px] w-[300px] opacity-[0.2]";

  return (
    <div
      aria-hidden="true"
      className={`celestial-surface pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      <svg className="absolute inset-0 h-full w-full" width="100%" height="100%">
        {STARS.map((star, i) => (
          <circle
            key={i}
            cx={`${star.x}%`}
            cy={`${star.y}%`}
            r={star.r}
            fill="#F6E3B4"
            opacity={star.o}
            className={star.twinkle ? "star-twinkle" : undefined}
          />
        ))}
      </svg>

      {variant === "page" && (
        <svg
          viewBox="0 0 200 120"
          className="absolute left-6 top-8 h-28 w-48 opacity-40 sm:left-16 sm:h-36 sm:w-60"
        >
          <polyline
            points={CONSTELLATION.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="#E8C77E"
            strokeWidth="0.8"
            strokeDasharray="2 3"
          />
          {CONSTELLATION.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="2.2" fill="#F6E3B4" />
          ))}
        </svg>
      )}

      <svg viewBox="0 0 400 400" className={`absolute ${wheelPosition}`}>
        <g fill="none" stroke="#E8C77E" strokeWidth="0.8">
          <circle cx="200" cy="200" r="190" />
          <circle cx="200" cy="200" r="176" />
          <circle cx="200" cy="200" r="120" />
          <circle cx="200" cy="200" r="60" />
          <circle cx="200" cy="200" r="18" />
          {SPOKES.map((s, i) => (
            <line key={`s${i}`} {...s} />
          ))}
          {TICKS.map((t, i) => (
            <line key={`t${i}`} {...t} />
          ))}
        </g>
        {DOTS.map((d, i) => (
          <circle key={`d${i}`} cx={d.x} cy={d.y} r="3" fill="#E8C77E" />
        ))}
      </svg>
    </div>
  );
}
