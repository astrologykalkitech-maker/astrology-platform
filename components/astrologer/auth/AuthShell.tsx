import type { ReactNode } from "react";
import Link from "next/link";
import {
  Award,
  BadgeCheck,
  CalendarClock,
  Languages,
  MessageSquareText,
  Send,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";
import { Logo } from "@/components/astrologer/Logo";
import { Ornament } from "@/components/astrologer/ui/Ornament";

export type AuthRole = "astrologer" | "customer";
type Mode = "login" | "signup";
type Feature = { label: string; icon: LucideIcon };
type Content = { eyebrow?: string; heading: string[]; description: string; features: Feature[] };

const CONTENT: Record<AuthRole, Record<Mode, Content>> = {
  astrologer: {
    login: {
      eyebrow: "For Astrologers",
      heading: ["Share Your Wisdom", "Reach More People"],
      description: "Join a trusted platform and connect with seekers looking for authentic guidance.",
      features: [
        { label: "Approved Listings", icon: BadgeCheck },
        { label: "Genuine Enquiries", icon: MessageSquareText },
        { label: "Grow Your Practice", icon: TrendingUp },
        { label: "Flexible Consultation Modes", icon: CalendarClock },
      ],
    },
    signup: {
      eyebrow: "For Astrologers",
      heading: ["Begin Your Journey", "as an Astrologer"],
      description: "Create your profile, get approved and connect with people seeking guidance.",
      features: [
        { label: "Build Your Reputation", icon: Award },
        { label: "Get Genuine Leads", icon: Users },
        { label: "Showcase Your Expertise", icon: Sparkles },
      ],
    },
  },
  customer: {
    login: {
      eyebrow: "For Seekers",
      heading: ["Find Guidance", "You Can Trust"],
      description: "Connect with approved astrologers for thoughtful, personal guidance.",
      features: [
        { label: "Approved Astrologers", icon: BadgeCheck },
        { label: "Simple Enquiries", icon: Send },
        { label: "Choose by Specialty and Language", icon: Languages },
      ],
    },
    signup: {
      eyebrow: "For Seekers",
      heading: ["Begin Your Search", "for Guidance"],
      description: "Create your account to connect with approved astrologers.",
      features: [
        { label: "Approved Astrologers", icon: BadgeCheck },
        { label: "Simple Enquiries", icon: Send },
        { label: "Choose by Specialty and Language", icon: Languages },
      ],
    },
  },
};

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

function RoleSwitch({ role, mode }: { role: AuthRole; mode: Mode }) {
  const options: { key: AuthRole; label: string; icon: LucideIcon }[] = [
    { key: "astrologer", label: "Astrologer", icon: Sparkles },
    { key: "customer", label: "Customer", icon: UserRound },
  ];

  return (
    <nav aria-label="Account type" className="grid grid-cols-2 gap-1 rounded-xl bg-midnight p-1">
      {options.map(({ key, label, icon: Icon }) => {
        const active = key === role;
        return (
          <Link
            key={key}
            href={`/${key}/${mode}`}
            aria-current={active ? "page" : undefined}
            className={`flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${FOCUS} ${
              active
                ? "bg-gradient-to-b from-[#e8c577] to-[#b98a36] text-midnight shadow"
                : "text-ivory/75 hover:text-ivory"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function ModeTabs({ role, mode }: { role: AuthRole; mode: Mode }) {
  const tab = (key: Mode, label: string) => (
    <Link
      key={key}
      href={`/${role}/${key}`}
      aria-current={mode === key ? "page" : undefined}
      className={`-mb-px border-b-2 px-1 pb-2 text-sm font-semibold transition-colors ${FOCUS} ${
        mode === key ? "border-gold text-midnight" : "border-transparent text-muted hover:text-midnight"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav aria-label="Login or sign up" className="mt-3 flex gap-6 border-b border-line">
      {tab("login", "Login")}
      {tab("signup", "Sign up")}
    </nav>
  );
}

export function AuthShell({
  mode,
  role = "astrologer",
  children,
}: {
  mode: Mode;
  role?: AuthRole;
  children: ReactNode;
}) {
  const content = CONTENT[role][mode];

  return (
    <main className="relative min-h-dvh overflow-hidden">
      <CelestialBackground />

      <div className="relative z-10 mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-8 px-4 py-5 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        <section className="hidden text-ivory lg:block">
          <Logo />

          <div className="mt-8">
            {content.eyebrow && <p className="font-display text-xl text-champagne">{content.eyebrow}</p>}
            <Ornament className="mt-3 max-w-[160px]" />
            <p className="mt-3 font-display text-4xl font-semibold leading-[1.15] xl:text-5xl">
              {content.heading.map((line) => (
                <span key={line} className="block">{line}</span>
              ))}
            </p>
            <p className="mt-3 max-w-md text-base leading-relaxed text-ivory/75 [@media(max-height:600px)]:hidden">
              {content.description}
            </p>
          </div>

          <ul className="mt-6 space-y-3 [@media(max-height:640px)]:hidden">
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
          <div className="mb-4 flex justify-center lg:hidden">
            <Logo />
          </div>

          <div className="rise-in relative overflow-hidden rounded-2xl bg-ivory p-5 text-ink shadow-[0_30px_60px_-20px_rgba(0,0,0,0.7)] ring-1 ring-gold/40 sm:p-6">
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
            <RoleSwitch role={role} mode={mode} />
            <ModeTabs role={role} mode={mode} />
            <div className="mt-4">{children}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
