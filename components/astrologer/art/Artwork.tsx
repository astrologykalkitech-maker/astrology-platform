/* Hand-built SVG scenes: Indian palace skyline, moon, ringed planet and zodiac sun wheel. */

const GOLD = "#C49A4A";
const CHAMPAGNE = "#E8D4A6";
const WINDOW = "#F6C971";

function rand(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SKY_STARS = (() => {
  const r = rand(77);
  return Array.from({ length: 90 }, () => ({
    x: +(r() * 1200).toFixed(1),
    y: +(r() * 250).toFixed(1),
    r: +(0.5 + r() * 1.3).toFixed(2),
    o: +(0.3 + r() * 0.7).toFixed(2),
  }));
})();

const polar = (cx: number, cy: number, radius: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return [+(cx + radius * Math.cos(a)).toFixed(2), +(cy + radius * Math.sin(a)).toFixed(2)] as const;
};

function Defs({ id }: { id: string }) {
  return (
    <defs>
      <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#0a0720" />
        <stop offset="0.45" stopColor="#1c1140" />
        <stop offset="0.8" stopColor="#4a2656" />
        <stop offset="1" stopColor="#8a4a3c" />
      </linearGradient>
      <radialGradient id={`${id}-moon`} cx="0.4" cy="0.38" r="0.7">
        <stop offset="0" stopColor="#FFF6DC" />
        <stop offset="0.7" stopColor="#E9C98B" />
        <stop offset="1" stopColor="#B88A4A" />
      </radialGradient>
      <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#F6C971" stopOpacity="0.55" />
        <stop offset="1" stopColor="#F6C971" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={`${id}-planet`} cx="0.35" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#F2C28A" />
        <stop offset="0.6" stopColor="#B8743E" />
        <stop offset="1" stopColor="#5A2F25" />
      </radialGradient>
      <radialGradient id={`${id}-sun`} cx="0.5" cy="0.45" r="0.6">
        <stop offset="0" stopColor="#F7DC9A" />
        <stop offset="1" stopColor="#B98A3A" />
      </radialGradient>
      <path id={`${id}-onion`} d="M-30,0 C-38,-26 -34,-50 0,-94 C34,-50 38,-26 30,0 Z" />
      <path id={`${id}-arch`} d="M-6,0 V-15 A6,6 0 0 1 6,-15 V0 Z" />
    </defs>
  );
}

function Dome({ id, x, y, s = 1 }: { id: string; x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <use href={`#${id}-onion`} fill="#150f2c" stroke={CHAMPAGNE} strokeOpacity="0.55" strokeWidth="1.2" />
      <path d="M0,-94 V-116" stroke={GOLD} strokeWidth="2" />
      <circle cx="0" cy="-118" r="3.5" fill={GOLD} />
    </g>
  );
}

function ArchRow({ id, x, y, count, gap }: { id: string; x: number; y: number; count: number; gap: number }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => (
        <use key={i} href={`#${id}-arch`} x={x + i * gap} y={y} fill={WINDOW} opacity="0.92" />
      ))}
    </g>
  );
}

function Palace({ id, x = 0 }: { id: string; x?: number }) {
  return (
    <g transform={`translate(${x} 0)`}>
      <ellipse cx="690" cy="262" rx="260" ry="90" fill={`url(#${id}-glow)`} />
      {/* garden trees, behind the building */}
      {[470, 488, 905, 925, 948].map((tx, i) => (
        <circle key={tx} cx={tx} cy={320 - (i % 2) * 8} r={26 - (i % 3) * 3} fill="#0b0a1e" />
      ))}
      <rect x="450" y="318" width="520" height="30" fill="#0b0a1e" />
      {/* wings */}
      <rect x="500" y="278" width="110" height="62" fill="#120c27" />
      <rect x="772" y="278" width="110" height="62" fill="#120c27" />
      <ArchRow id={id} x={522} y={322} count={4} gap={26} />
      <ArchRow id={id} x={794} y={322} count={4} gap={26} />
      {/* towers */}
      <rect x="560" y="196" width="36" height="144" fill="#150f2c" />
      <rect x="786" y="196" width="36" height="144" fill="#150f2c" />
      <Dome id={id} x={578} y={196} s={0.42} />
      <Dome id={id} x={804} y={196} s={0.42} />
      <ArchRow id={id} x={572} y={250} count={1} gap={0} />
      <ArchRow id={id} x={798} y={250} count={1} gap={0} />
      {/* main hall */}
      <rect x="598" y="236" width="184" height="104" fill="#160f2e" />
      <rect x="640" y="214" width="100" height="26" fill="#1a1234" stroke={CHAMPAGNE} strokeOpacity="0.35" />
      <Dome id={id} x={690} y={214} s={0.95} />
      <Dome id={id} x={620} y={236} s={0.36} />
      <Dome id={id} x={760} y={236} s={0.36} />
      <ArchRow id={id} x={620} y={322} count={6} gap={28} />
      <path d="M674,340 V300 A16,16 0 0 1 706,300 V340 Z" fill={WINDOW} opacity="0.95" />
      <rect x="598" y="262" width="184" height="2" fill={GOLD} opacity="0.7" />
    </g>
  );
}

function ZodiacWheel({ cx, cy, r, id }: { cx: number; cy: number; r: number; id: string }) {
  const k = r / 150;
  return (
    <g transform={`translate(${cx} ${cy}) scale(${k})`}>
      <circle r="156" fill={`url(#${id}-glow)`} opacity="0.55" />
      <g fill="none" stroke={GOLD} strokeWidth="1.1">
        <circle r="150" />
        <circle r="144" strokeOpacity="0.6" />
        <circle r="112" />
        <circle r="104" strokeOpacity="0.6" />
        <circle r="70" />
        {Array.from({ length: 120 }, (_, i) => {
          const a = polar(0, 0, i % 10 === 0 ? 132 : 138, i * 3);
          const b = polar(0, 0, 144, i * 3);
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} strokeWidth={i % 10 === 0 ? 1.2 : 0.5} />;
        })}
        {Array.from({ length: 12 }, (_, i) => {
          const a = polar(0, 0, 70, i * 30);
          const b = polar(0, 0, 112, i * 30);
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} />;
        })}
        {Array.from({ length: 12 }, (_, i) => (
          <ellipse key={i} cx="0" cy="-123" rx="7" ry="11" transform={`rotate(${i * 30 + 15})`} stroke={CHAMPAGNE} />
        ))}
      </g>
      {Array.from({ length: 12 }, (_, i) => {
        const p = polar(0, 0, 90, i * 30 + 15);
        return <circle key={i} cx={p[0]} cy={p[1]} r={i % 3 === 0 ? 4 : 2.6} fill={CHAMPAGNE} />;
      })}
      {/* sun */}
      <g>
        {Array.from({ length: 24 }, (_, i) => {
          const a = polar(0, 0, 44, i * 15);
          const b = polar(0, 0, i % 2 ? 56 : 66, i * 15);
          const c = polar(0, 0, 44, i * 15 + 7);
          return <polygon key={i} points={`${a[0]},${a[1]} ${b[0]},${b[1]} ${c[0]},${c[1]}`} fill={GOLD} />;
        })}
        <circle r="42" fill={`url(#${id}-sun)`} stroke={CHAMPAGNE} strokeWidth="1.2" />
        <g fill="none" stroke="#6b4614" strokeWidth="1.8" strokeLinecap="round">
          <path d="M-16,-8 q6,-5 12,0" />
          <path d="M4,-8 q6,-5 12,0" />
          <path d="M0,-4 v12 q-3,3 -6,1" />
          <path d="M-12,18 q12,9 24,0" />
        </g>
      </g>
    </g>
  );
}

/** Wide night-sky scene: moon, ringed planet, palace skyline and zodiac sun wheel. */
export function SkyScene({
  id = "sky",
  className = "",
  align = "xMidYMax",
}: {
  id?: string;
  className?: string;
  align?: "xMidYMax" | "xMaxYMax" | "xMaxYMid";
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1200 340"
      preserveAspectRatio={`${align} slice`}
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
    >
      <Defs id={id} />
      <rect width="1200" height="340" fill={`url(#${id}-sky)`} />
      {SKY_STARS.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#F6E7BF" opacity={s.o} />
      ))}
      <circle cx="610" cy="92" r="70" fill={`url(#${id}-glow)`} />
      <circle cx="610" cy="92" r="38" fill={`url(#${id}-moon)`} />
      <g fill="#B88A4A" opacity="0.35">
        <circle cx="598" cy="84" r="6" />
        <circle cx="624" cy="104" r="4.5" />
        <circle cx="616" cy="76" r="3" />
      </g>
      <g transform="translate(860 52) rotate(-18)">
        <ellipse rx="40" ry="9" fill="none" stroke={CHAMPAGNE} strokeOpacity="0.7" strokeWidth="2" />
        <circle r="17" fill={`url(#${id}-planet)`} />
        <path d="M-40,0 A40,9 0 0 0 40,0" fill="none" stroke={CHAMPAGNE} strokeOpacity="0.9" strokeWidth="2" />
      </g>
      <ZodiacWheel cx={985} cy={170} r={140} id={id} />
      <Palace id={id} x={-10} />
      <rect y="336" width="1200" height="4" fill="#0b0a1e" />
    </svg>
  );
}

/** Tall arched window with the palace at dusk, used at the bottom of the sidebar. */
export function ArchScene({ id = "arch", className = "" }: { id?: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 200 230" className={`pointer-events-none ${className}`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d0824" />
          <stop offset="0.6" stopColor="#3a2150" />
          <stop offset="1" stopColor="#9a5a40" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F6C971" stopOpacity="0.6" />
          <stop offset="1" stopColor="#F6C971" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`${id}-clip`}>
          <path d="M20,230 V95 C20,60 60,48 100,8 C140,48 180,60 180,95 V230 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="200" height="230" fill={`url(#${id}-sky)`} />
        {Array.from({ length: 16 }, (_, i) => (
          <circle key={i} cx={30 + ((i * 53) % 140)} cy={20 + ((i * 37) % 90)} r={0.8 + (i % 3) * 0.3} fill="#F6E7BF" opacity="0.8" />
        ))}
        <circle cx="140" cy="62" r="10" fill="#F6E3B0" />
        <ellipse cx="100" cy="190" rx="80" ry="40" fill={`url(#${id}-glow)`} />
        <rect x="50" y="170" width="100" height="60" fill="#150f2c" />
        <rect x="42" y="150" width="14" height="80" fill="#150f2c" />
        <rect x="144" y="150" width="14" height="80" fill="#150f2c" />
        <path d="M49,150 C44,138 46,128 49,118 C52,128 54,138 49,150 Z" fill="#150f2c" />
        <path d="M151,150 C146,138 148,128 151,118 C154,128 156,138 151,150 Z" fill="#150f2c" />
        <path d="M70,170 C62,148 66,128 100,96 C134,128 138,148 130,170 Z" fill="#190f30" stroke="#E8D4A6" strokeOpacity="0.5" />
        <path d="M100,96 V84" stroke={GOLD} strokeWidth="1.5" />
        {[62, 80, 98, 116, 134].map((x) => (
          <path key={x} d={`M${x},228 V212 A5,5 0 0 1 ${x + 10},212 V228 Z`} fill={WINDOW} opacity="0.9" />
        ))}
        <circle cx="30" cy="224" r="18" fill="#0b0a1e" />
        <circle cx="172" cy="224" r="20" fill="#0b0a1e" />
      </g>
      <path d="M20,230 V95 C20,60 60,48 100,8 C140,48 180,60 180,95 V230" fill="none" stroke={GOLD} strokeWidth="2" />
      <path d="M27,230 V95 C27,64 64,54 100,18 C136,54 173,64 173,95 V230" fill="none" stroke={CHAMPAGNE} strokeOpacity="0.5" strokeWidth="0.8" />
    </svg>
  );
}

/** Ringed planet used in the daily insight card. */
export function PlanetScene({ id = "planet", className = "" }: { id?: string; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 300 160" preserveAspectRatio="xMidYMid slice" className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0a0720" />
          <stop offset="1" stopColor="#2b1747" />
        </linearGradient>
        <radialGradient id={`${id}-p`} cx="0.35" cy="0.35" r="0.8">
          <stop offset="0" stopColor="#F2C28A" />
          <stop offset="0.55" stopColor="#B8743E" />
          <stop offset="1" stopColor="#4a2520" />
        </radialGradient>
      </defs>
      <rect width="300" height="160" fill={`url(#${id}-sky)`} />
      {SKY_STARS.slice(0, 45).map((s, i) => (
        <circle key={i} cx={(s.x / 1200) * 300} cy={(s.y / 250) * 160} r={s.r * 0.7} fill="#F6E7BF" opacity={s.o} />
      ))}
      <circle cx="70" cy="86" r="44" fill={`url(#${id}-p)`} />
      <g fill="#7a4326" opacity="0.5">
        <ellipse cx="62" cy="72" rx="30" ry="3" />
        <ellipse cx="74" cy="90" rx="36" ry="3.5" />
        <ellipse cx="64" cy="104" rx="28" ry="3" />
      </g>
    </svg>
  );
}
