import type { ReactNode } from "react";
import Link from "next/link";
import {
  Award,
  BadgeCheck,
  CalendarClock,
  MessageSquareText,
  Sparkles,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";
import { Logo } from "@/components/astrologer/Logo";
import { Ornament } from "@/components/astrologer/ui/Ornament";

type Mode = "login" | "signup";

type Feature = { label: string; icon: LucideIcon };

const CONTENT: Record<
  Mode,
  { eyebrow?: string; heading: string[]; description: string; features: Feature[] }
> = {
  login: {
    eyebrow: "For Astrologers",
    heading: ["Share Your Wisdom", "Reach More People"],
    description:
      "Join a trusted platform and connect with seekers looking for authentic guidance.",
    features: [
      { label: "Approved Listings", icon: BadgeCheck },
      { label: "Genuine Enquiries", icon: MessageSquareText },
      { label: "Grow Your Practice", icon: TrendingUp },
      { label: "Flexible Consultation Modes", icon: CalendarClock },
    ],
  },
  signup: {
    heading: ["Begin Your Journey", "as an Astrologer"],
    description:
      "Create your profile, get approved and connect with people seeking guidance.",
    features: [
      { label: "Build Your Reputation", icon: Award },
      { label: "Get Genuine Leads", icon: Users },
      { label: "Showcase Your Expertise", icon: Sparkles },
    ],
  },
};

function AuthTabs({ mode }: { mode: Mode }) {
  const base =
    "flex h-10 items-center justify-center rounded-lg text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
  const active = "bg-white text-midnight shadow-sm ring-1 ring-gold/40";
  const idle = "text-muted hover:text-midnight";

  return (
    <nav aria-label="Account" className="grid grid-cols-2 gap-1 rounded-xl bg-parchment p-1">
      <Link
        href="/astrologer/login"
        aria-current={mode === "login" ? "page" : undefined}
        className={`${base} ${mode === "login" ? active : idle}`}
      >
        Login
      </Link>
      <Link
        href="/astrologer/signup"
        aria-current={mode === "signup" ? "page" : undefined}
        className={`${base} ${mode === "signup" ? active : idle}`}
      >
        Sign up
      </Link>
    </nav>
  );
}

export function AuthShell({ mode, children }: { mode: Mode; children: ReactNode }) {
  const content = CONTENT[mode];

  return (
    <main className="relative min-h-screen overflow-hidden">
      <CelestialBackground />

      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <section className="hidden text-ivory lg:block">
          <Logo />

          <div className="mt-16">
            {content.eyebrow && (
              <p className="font-display text-2xl text-champagne">{content.eyebrow}</p>
            )}
            <Ornament className="mt-4 max-w-[180px]" />
            <p className="mt-4 font-display text-5xl font-semibold leading-[1.15]">
              {content.heading.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
            <p className="mt-5 max-w-md text-base leading-relaxed text-ivory/75">
              {content.description}
            </p>
          </div>

          <ul className="mt-10 space-y-4">
            {content.features.map(({ label, icon: Icon }) => (
              <li key={label} className="flex items-center gap-3 text-ivory/90">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-gold/50 bg-gold/10 text-champagne">
                  <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <span className="text-sm font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mx-auto w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <Logo />
          </div>

          <div className="rise-in relative overflow-hidden rounded-2xl bg-ivory p-6 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-gold/40 sm:p-8">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
            <AuthTabs mode={mode} />
            <div className="mt-6">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
