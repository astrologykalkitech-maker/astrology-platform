"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { Menu, X, Sparkles, ChevronDown, User, ArrowRight } from "lucide-react";
import { Logo } from "@/components/astrologer/Logo";

interface PublicNavbarProps {
  currentRole?: string | null;
  isLoggedIn?: boolean;
}

export function PublicNavbar({ currentRole, isLoggedIn = false }: PublicNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnterServices = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setServicesOpen(true);
  };

  const handleMouseLeaveServices = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
    }
    dropdownTimeoutRef.current = setTimeout(() => {
      setServicesOpen(false);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (dropdownTimeoutRef.current) {
        clearTimeout(dropdownTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const dashboardUrl =
    currentRole === "super_admin" || currentRole === "admin"
      ? "/super-admin"
      : currentRole === "consultant_admin"
      ? "/admin"
      : currentRole === "astrologer"
      ? "/astrologer/dashboard"
      : "/customer/astrologers";

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#130b24]/95 backdrop-blur-md border-b border-gold/25 shadow-xl py-3"
          : "bg-[#130b24]/60 backdrop-blur-xs py-4 sm:py-5"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-gold"
          aria-label="JyotishSetu Home"
          onClick={() => setMobileMenuOpen(false)}
        >
          <Logo tone="light" showTagline={true} tagline="Bridging Wisdom, Connecting Lives" />
        </Link>

        {/* Desktop Nav Items - Exactly as shown in reference: Home, Talk to Astrologer, Services v, How It Works, About */}
        <nav
          aria-label="Main public navigation"
          className="hidden md:flex items-center gap-6 lg:gap-7 text-[13px] font-medium text-white/90"
        >
          <Link
            href="/"
            className="text-white hover:text-champagne transition-colors focus-visible:outline-2 focus-visible:outline-gold rounded-md px-1 relative after:absolute after:bottom-[-4px] after:left-1 after:right-1 after:h-[2px] after:bg-[#dfba63] after:rounded-full"
          >
            Home
          </Link>
          <Link
            href="/customer/astrologers"
            className="hover:text-champagne transition-colors focus-visible:outline-2 focus-visible:outline-gold rounded-md px-1"
          >
            Talk to Astrologer
          </Link>

          {/* Services Dropdown */}
          <div
            className="relative"
            onMouseEnter={handleMouseEnterServices}
            onMouseLeave={handleMouseLeaveServices}
          >
            <button
              type="button"
              onClick={() => setServicesOpen((prev) => !prev)}
              className="flex items-center gap-1 hover:text-champagne transition-colors focus-visible:outline-2 focus-visible:outline-gold rounded-md px-1 cursor-pointer py-1"
              aria-expanded={servicesOpen}
              aria-haspopup="true"
            >
              <span>Services</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${servicesOpen ? "rotate-180" : ""}`} />
            </button>

            {servicesOpen && (
              <div
                role="menu"
                className="absolute top-full left-0 pt-1.5 w-68 z-50 animate-in fade-in zoom-in-95 duration-150"
              >
                <div className="rounded-2xl border border-gold/40 bg-[#160d2e]/98 p-2.5 shadow-2xl backdrop-blur-md text-left">
                  <Link
                    href={isLoggedIn ? "/customer/astrologers?service=love" : "/customer/login?next=/customer/astrologers"}
                    role="menuitem"
                    onClick={() => setServicesOpen(false)}
                    className="flex flex-col rounded-xl p-2.5 hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <span className="font-semibold text-champagne text-xs group-hover:text-gold transition-colors">Love & Relationships</span>
                    <span className="text-[11px] text-white/70">Find clarity in love, marriage and relationships</span>
                  </Link>
                  <Link
                    href={isLoggedIn ? "/customer/astrologers?service=career" : "/customer/login?next=/customer/astrologers"}
                    role="menuitem"
                    onClick={() => setServicesOpen(false)}
                    className="flex flex-col rounded-xl p-2.5 hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <span className="font-semibold text-champagne text-xs group-hover:text-gold transition-colors">Career & Finance</span>
                    <span className="text-[11px] text-white/70">Get guidance for career growth & financial stability</span>
                  </Link>
                  <Link
                    href={isLoggedIn ? "/customer/astrologers?service=kundli" : "/customer/login?next=/customer/astrologers"}
                    role="menuitem"
                    onClick={() => setServicesOpen(false)}
                    className="flex flex-col rounded-xl p-2.5 hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <span className="font-semibold text-champagne text-xs group-hover:text-gold transition-colors">Kundli & Birth Chart</span>
                    <span className="text-[11px] text-white/70">Decode your life path with detailed Kundli analysis</span>
                  </Link>
                  <Link
                    href={isLoggedIn ? "/customer/astrologers?service=family" : "/customer/login?next=/customer/astrologers"}
                    role="menuitem"
                    onClick={() => setServicesOpen(false)}
                    className="flex flex-col rounded-xl p-2.5 hover:bg-white/10 transition-colors group cursor-pointer"
                  >
                    <span className="font-semibold text-champagne text-xs group-hover:text-gold transition-colors">Family & Wellbeing</span>
                    <span className="text-[11px] text-white/70">Find solutions for family harmony & mental peace</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          <Link
            href="/#how-it-works"
            className="hover:text-champagne transition-colors focus-visible:outline-2 focus-visible:outline-gold rounded-md px-1"
          >
            How It Works
          </Link>
          <Link
            href="/#about"
            className="hover:text-champagne transition-colors focus-visible:outline-2 focus-visible:outline-gold rounded-md px-1"
          >
            About
          </Link>
        </nav>

        {/* Desktop Action Buttons: Exactly as in reference: [user icon Log in]  [Get Started ->] */}
        <div className="hidden md:flex items-center gap-3">
          {isLoggedIn ? (
            <Link
              href={dashboardUrl}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#dfba63] to-[#c5963a] px-4 py-2 text-xs font-bold text-midnight shadow-md hover:brightness-105 transition-all focus-visible:outline-2 focus-visible:outline-gold"
            >
              <span>Go to Dashboard</span>
              <Sparkles className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <>
              <Link
                href="/customer/login"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 hover:border-gold/40 transition-colors focus-visible:outline-2 focus-visible:outline-gold"
              >
                <User className="h-3.5 w-3.5 text-white/80" />
                <span>Log in</span>
              </Link>
              <Link
                href="/customer/signup"
                className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#e3c16f] to-[#cf9e3e] px-4 py-2 text-xs font-bold text-midnight shadow-md hover:brightness-105 transition-all focus-visible:outline-2 focus-visible:outline-gold"
              >
                <span>Get Started</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile Action Buttons: Exactly matching reference image 2: [Get Started ->]  [Hamburger Button] */}
        <div className="flex md:hidden items-center gap-2.5">
          <Link
            href="/customer/signup"
            className="inline-flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#e3c16f] to-[#cf9e3e] px-3.5 py-1.5 text-xs font-bold text-midnight shadow-md hover:brightness-105 transition-all"
          >
            <span>Get Started</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 p-1.5 text-ivory hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-gold"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5 text-champagne" /> : <Menu className="h-5 w-5 text-ivory" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-b border-gold/30 bg-[#140c29]/98 px-4 pt-4 pb-6 backdrop-blur-xl animate-in slide-in-from-top-4 duration-200">
          <nav className="flex flex-col space-y-3 text-sm font-medium text-white">
            <Link
              href="/"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-3 py-2 text-champagne bg-white/5 font-semibold"
            >
              Home
            </Link>
            <Link
              href="/customer/astrologers"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-3 py-2 hover:bg-white/5 transition-colors"
            >
              Talk to Astrologer
            </Link>
            <Link
              href="/#services"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-3 py-2 hover:bg-white/5 transition-colors"
            >
              Services
            </Link>
            <Link
              href="/#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-3 py-2 hover:bg-white/5 transition-colors"
            >
              How It Works
            </Link>
            <Link
              href="/#about"
              onClick={() => setMobileMenuOpen(false)}
              className="rounded-xl px-3 py-2 hover:bg-white/5 transition-colors"
            >
              About
            </Link>

            <div className="pt-4 border-t border-white/10 flex flex-col gap-2.5">
              {isLoggedIn ? (
                <Link
                  href={dashboardUrl}
                  onClick={() => setMobileMenuOpen(false)}
                  className="w-full text-center rounded-xl bg-gradient-to-r from-gold to-champagne py-2.5 text-xs font-bold text-midnight shadow-md"
                >
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link
                    href="/customer/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center rounded-xl border border-white/20 bg-white/5 py-2 text-xs font-semibold text-white"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/customer/signup"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center rounded-xl bg-gradient-to-r from-[#e3c16f] to-[#cf9e3e] py-2.5 text-xs font-bold text-midnight shadow-md"
                  >
                    Get Started
                  </Link>
                  <Link
                    href="/astrologer/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full text-center rounded-xl border border-gold/30 py-2 text-xs font-semibold text-champagne"
                  >
                    Astrologer Portal
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
