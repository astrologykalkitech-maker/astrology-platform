"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  User,
  Sparkles,
  ClipboardList,
  CalendarCheck2,
  Receipt,
  Gift,
  Bell,
  X,
  MessageSquare,
  HelpCircle,
  ShieldCheck,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { CustomerSignOutButton } from "@/components/customer/CustomerSignOutButton";
import { Ornament } from "@/components/astrologer/ui/Ornament";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/customer/astrologers", label: "Astrologers", icon: Sparkles },
  { href: "/customer/profile", label: "My Kundli Profile", icon: User },
  { href: "/customer/enquiries", label: "My Enquiries", icon: ClipboardList },
  { href: "/customer/bookings", label: "Bookings", icon: CalendarCheck2 },
  { href: "/customer/billing", label: "Billing & Receipts", icon: Receipt },
  { href: "/customer/notification", label: "Notifications", icon: Bell },
  { href: "/customer/offers", label: "Special Offers", icon: Gift },
  { href: "/customer/support", label: "Support & Help", icon: LifeBuoy },
];

const COMING_SOON: { label: string; icon: LucideIcon; desc: string }[] = [
  { label: "Live Chat", icon: MessageSquare, desc: "Instant one-on-one live messaging with verified Vedic pandits launching in Phase 2." },
  { label: "Kundli Matching", icon: HelpCircle, desc: "Ashtakoota 36-guna Milan compatibility chart generator launching soon." },
  { label: "Protection Rituals", icon: ShieldCheck, desc: "Personalized remedial Puja, Yantra, and Gemstone recommendations launching soon." },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

type SidebarProps = {
  open: boolean;
  isLoggedIn?: boolean;
  onNavigate: () => void;
  onClose: () => void;
};

export function CustomerSidebar({ open, isLoggedIn = true, onNavigate, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-hidden lg:w-64 border-r border-white/5 bg-midnight text-ivory transition-transform duration-200 lg:translate-x-0 ${
        open ? "translate-x-0" : "-translate-x-full max-lg:invisible"
      }`}
    >
      <Image
        src="/images/jyotishsetu/sidebar-palace-art.webp"
        alt="JyotishSetu Palace Art"
        fill
        priority
        sizes="288px"
        aria-hidden="true"
        className="pointer-events-none object-cover object-top"
      />
      {/* Dark gradient mask for clear readability while maintaining ancient temple aesthetics */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, rgba(21,16,39,0.1) 18%, rgba(21,16,39,0.85) 30%, rgba(21,16,39,0.92) 80%, rgba(21,16,39,0.4) 92%, rgba(21,16,39,0.1) 100%)",
        }}
      />

      {/* Brand logo click overlay */}
      <Link
        href="/customer/astrologers"
        onClick={onNavigate}
        className="absolute inset-x-6 top-[7%] z-10 h-[20%] rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne flex flex-col items-center justify-end pb-1"
      >
        <span className="sr-only">JyotishSetu Customer Portal, explore astrologers</span>
        <span className="rounded-full bg-midnight/90 px-3 py-0.5 text-[10px] font-bold uppercase tracking-widest text-champagne border border-gold/40 shadow-sm backdrop-blur-xs">
          Customer Portal
        </span>
      </Link>

      <button
        type="button"
        onClick={onClose}
        aria-label="Close menu"
        className="absolute right-3 top-3 z-20 rounded-lg bg-midnight/60 p-2 text-ivory/90 hover:bg-midnight focus-visible:outline-2 focus-visible:outline-champagne lg:hidden"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="absolute inset-x-0 bottom-3 top-[28%] z-10 flex flex-col overflow-y-auto px-5 sidebar-scrollbar">
        <nav aria-label="Customer portal navigation" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-3 rounded-xl px-3.5 py-2 text-sm font-medium transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-champagne ${
                  active
                    ? "bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] font-semibold text-midnight shadow-[0_8px_20px_-8px_rgba(196,154,74,0.7)]"
                    : "text-ivory/75 hover:translate-x-0.5 hover:bg-white/8 hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}

          <Ornament className="mt-3 px-2" />
          <p className="mt-2 px-3.5 text-[11px] font-semibold uppercase tracking-widest text-ivory/55">
            Coming soon
          </p>

          {COMING_SOON.map(({ label, icon: Icon }) => (
            <div
              key={label}
              aria-disabled="true"
              className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3.5 py-2 text-sm text-ivory/70"
            >
              <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
              <span>{label}</span>
              <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                Soon
              </span>
            </div>
          ))}
        </nav>

        <div className="mt-4 pt-3 pb-8 border-t border-gold/40 lg:hidden">
          {isLoggedIn ? (
            <CustomerSignOutButton
              variant="goldLight"
              className="w-full justify-center !text-midnight font-bold tracking-wide shadow-[0_4px_16px_rgba(232,197,119,0.4)]"
            />
          ) : (
            <Link
              href="/customer/login"
              onClick={onNavigate}
              className="flex w-full items-center justify-center rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-4 py-2.5 text-xs font-bold text-midnight shadow-[0_4px_16px_rgba(232,197,119,0.4)]"
            >
              Sign In to JyotishSetu
            </Link>
          )}
        </div>
      </div>
    </aside>
  );
}
