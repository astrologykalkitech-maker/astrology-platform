type Variant = "page" | "panel" | "cover";

type Props = {
  variant?: Variant;
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
  return Array.from({ length: 70 }, (_, i) => ({
    x: (rand() * 100).toFixed(2),
    y: (rand() * 100).toFixed(2),
    r: (0.4 + rand() * 1).toFixed(2),
    o: (0.2 + rand() * 0.55).toFixed(2),
    twinkle: i % 7 === 0,
  }));
})();

const GOLD = "#C49A4A";
const CHAMPAGNE = "#E8D4A6";

const pt = (radius: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return { x: +(200 + radius * Math.cos(a)).toFixed(2), y: +(200 + radius * Math.sin(a)).toFixed(2) };
};
const poly = (radius: number, startDeg: number, sides: number) =>
  Array.from({ length: sides }, (_, i) => {
    const p = pt(radius, startDeg + (360 / sides) * i);
    return `${p.x},${p.y}`;
  }).join(" ");

const TICKS = Array.from({ length: 120 }, (_, i) => {
  const long = i % 10 === 0;
  const a = pt(long ? 176 : 183, i * 3);
  const b = pt(190, i * 3);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, long };
});
const SPOKES = Array.from({ length: 12 }, (_, i) => {
  const a = pt(92, i * 30);
  const b = pt(170, i * 30);
  return { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
});
const ZODIAC_DOTS = Array.from({ length: 12 }, (_, i) => pt(160, i * 30 + 15));
const PETALS = Array.from({ length: 12 }, (_, i) => i * 30);
const PETALS_INNER = Array.from({ length: 8 }, (_, i) => i * 45 + 22.5);
const PLANETS = [
  { orbit: 0, deg: 20, r: 4 },
  { orbit: 0, deg: 200, r: 2.6 },
  { orbit: 1, deg: 110, r: 3.4 },
  { orbit: 1, deg: 290, r: 2.4 },
];
const ORBITS = [
  { rx: 172, ry: 62, rot: -24 },
  { rx: 150, ry: 46, rot: 32 },
];
const planetPos = (orbit: number, deg: number) => {
  const { rx, ry, rot } = ORBITS[orbit];
  const t = (deg * Math.PI) / 180;
  const x0 = rx * Math.cos(t);
  const y0 = ry * Math.sin(t);
  const r = (rot * Math.PI) / 180;
  return {
    x: +(200 + x0 * Math.cos(r) - y0 * Math.sin(r)).toFixed(2),
    y: +(200 + x0 * Math.sin(r) + y0 * Math.cos(r)).toFixed(2),
  };
};

const CONSTELLATIONS: [number, number][][] = [
  [[8, 88], [38, 58], [74, 72], [112, 30], [160, 46], [190, 12]],
  [[20, 20], [52, 34], [70, 8], [104, 40]],
];

/** An engraved astrolabe: zodiac ring, lotus mandala, yantra and planetary orbits. */
function Astrolabe({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 400 400" className={`absolute ${className}`}>
      <g fill="none" stroke={GOLD} strokeWidth="0.7">
        <circle cx="200" cy="200" r="194" />
        <circle cx="200" cy="200" r="190" />
        <circle cx="200" cy="200" r="170" />
        <circle cx="200" cy="200" r="150" strokeDasharray="1.5 3" />
        <circle cx="200" cy="200" r="92" />
        <circle cx="200" cy="200" r="70" />
        {TICKS.map((t, i) => (
          <line key={`t${i}`} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.long ? 1 : 0.5} />
        ))}
        {SPOKES.map((s, i) => (
          <line key={`s${i}`} {...s} strokeWidth="0.5" />
        ))}
        {PETALS.map((deg) => (
          <ellipse key={`p${deg}`} cx="200" cy="130" rx="11" ry="26" transform={`rotate(${deg} 200 200)`} stroke={CHAMPAGNE} strokeOpacity="0.8" />
        ))}
        {PETALS_INNER.map((deg) => (
          <ellipse key={`i${deg}`} cx="200" cy="168" rx="7" ry="16" transform={`rotate(${deg} 200 200)`} />
        ))}
        <polygon points={poly(64, -90, 3)} />
        <polygon points={poly(64, 90, 3)} />
        <polygon points={poly(46, -90, 4)} transform="rotate(45 200 200)" />
        <polygon points={poly(46, -90, 4)} />
        <circle cx="200" cy="200" r="14" />
        <circle cx="200" cy="200" r="6" fill={GOLD} />
        {ORBITS.map((o, i) => (
          <ellipse key={`o${i}`} cx="200" cy="200" rx={o.rx} ry={o.ry} transform={`rotate(${o.rot} 200 200)`} strokeOpacity="0.55" />
        ))}
      </g>
      {ZODIAC_DOTS.map((d, i) => (
        <circle key={`z${i}`} cx={d.x} cy={d.y} r="2.2" fill={CHAMPAGNE} />
      ))}
      {PLANETS.map((p, i) => {
        const pos = planetPos(p.orbit, p.deg);
        return <circle key={`pl${i}`} cx={pos.x} cy={pos.y} r={p.r} fill={CHAMPAGNE} />;
      })}
    </svg>
  );
}

function Constellation({ points, className }: { points: [number, number][]; className: string }) {
  return (
    <svg viewBox="0 0 200 100" className={`absolute ${className}`}>
      <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} fill="none" stroke={CHAMPAGNE} strokeWidth="0.6" strokeDasharray="2 3" />
      {points.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="4" fill="none" stroke={GOLD} strokeWidth="0.4" />
          <circle cx={x} cy={y} r="1.8" fill={CHAMPAGNE} />
        </g>
      ))}
    </svg>
  );
}

export function CelestialBackground({ variant = "page", className = "" }: Props) {
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
            fill="#F6E7BF"
            opacity={star.o}
            className={star.twinkle ? "star-twinkle" : undefined}
          />
        ))}
      </svg>

      {variant === "page" && (
        <>
          <Astrolabe className="-right-44 -top-44 h-[680px] w-[680px] opacity-[0.28]" />
          <Astrolabe className="-bottom-72 -left-40 h-[520px] w-[520px] opacity-[0.12]" />
          <Constellation points={CONSTELLATIONS[0]} className="left-6 top-8 h-28 w-52 opacity-50 sm:left-16 sm:h-36 sm:w-64" />
        </>
      )}

      {variant === "panel" && (
        <>
          <Astrolabe className="-bottom-24 -left-24 h-[340px] w-[340px] opacity-[0.3]" />
          <Constellation points={CONSTELLATIONS[1]} className="right-2 top-24 h-16 w-32 opacity-40" />
        </>
      )}

      {variant === "cover" && (
        <>
          <Astrolabe className="-right-10 -top-24 h-[420px] w-[420px] opacity-[0.34] sm:-right-4 sm:h-[480px] sm:w-[480px]" />
          <Astrolabe className="-bottom-40 left-1/4 hidden h-[300px] w-[300px] opacity-[0.12] md:block" />
          <Constellation points={CONSTELLATIONS[0]} className="left-4 top-4 h-20 w-40 opacity-40 sm:left-8 sm:h-24 sm:w-52" />
        </>
      )}
    </div>
  );
}
