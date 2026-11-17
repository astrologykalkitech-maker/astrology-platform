import Link from "next/link";
import { Logo } from "@/components/astrologer/Logo";
import { ShieldCheck, Sparkles, HeartHandshake } from "lucide-react";

export function PublicFooter() {
  return (
    <footer className="border-t border-gold/25 bg-midnight text-ivory relative overflow-hidden">
      {/* Background glow decoration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full bg-gold/5 blur-[120px]"
      />

      <div className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-12">
          {/* Brand Column */}
          <div className="lg:col-span-2 space-y-4">
            <Logo tone="light" showTagline={true} />
            <p className="text-xs sm:text-sm text-ivory/70 leading-relaxed max-w-sm">
              Karmic Ascension bridges timeless Vedic astrological wisdom with modern digital guidance.
              Connect with verified Vedic pandits, Prashna Kundli experts, and spiritual guides for
              authentic clarity in life, love, career, and wellbeing.
            </p>
            <div className="flex items-center gap-3 pt-2 text-xs text-champagne/90">
              <span className="flex items-center gap-1.5 rounded-full bg-white/5 border border-gold/30 px-3 py-1">
                <ShieldCheck className="h-3.5 w-3.5 text-gold" />
                <span>100% Verified Pandits</span>
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-white/5 border border-gold/30 px-3 py-1">
                <Sparkles className="h-3.5 w-3.5 text-gold" />
                <span>Private & Secure</span>
              </span>
            </div>
          </div>

          {/* Quick Links */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-champagne">Divine Services</p>
            <ul className="space-y-2 text-xs sm:text-sm text-ivory/75">
              <li>
                <Link href="/#services" className="hover:text-champagne transition-colors">
                  Kundli & Janam Patrika
                </Link>
              </li>
              <li>
                <Link href="/#services" className="hover:text-champagne transition-colors">
                  Love & Relationship Guidance
                </Link>
              </li>
              <li>
                <Link href="/#services" className="hover:text-champagne transition-colors">
                  Career, Business & Muhurat
                </Link>
              </li>
              <li>
                <Link href="/#services" className="hover:text-champagne transition-colors">
                  Vedic Remedies & Dosha Nivarana
                </Link>
              </li>
              <li>
                <Link href="/#astrologers" className="hover:text-champagne transition-colors">
                  Verified Astrologer Directory
                </Link>
              </li>
            </ul>
          </div>

          {/* User & Astrologer Portals */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-champagne">Portals & Access</p>
            <ul className="space-y-2 text-xs sm:text-sm text-ivory/75">
              <li>
                <Link href="/auth?role=customer" className="hover:text-champagne transition-colors">
                  Customer Account
                </Link>
              </li>
              <li>
                <Link href="/auth?role=astrologer" className="hover:text-champagne transition-colors">
                  Astrologer Portal
                </Link>
              </li>
              <li>
                <Link href="/#how-it-works" className="hover:text-champagne transition-colors">
                  Consultation Guide
                </Link>
              </li>
            </ul>
          </div>

          {/* Trust, Security & Support */}
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-champagne">Help & Policies</p>
            <ul className="space-y-2 text-xs sm:text-sm text-ivory/75">
              <li>
                <Link href="/customer/support" className="hover:text-champagne transition-colors flex items-center gap-1.5">
                  <HeartHandshake className="h-3.5 w-3.5 text-gold" />
                  <span>Support Desk</span>
                </Link>
              </li>
              <li>
                <Link href="/#faq" className="hover:text-champagne transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
              <li>
                <span className="text-ivory/50 cursor-default">Privacy Policy (Vedic Privacy)</span>
              </li>
              <li>
                <span className="text-ivory/50 cursor-default">Terms & Consultation Rules</span>
              </li>
              <li>
                <span className="text-ivory/50 cursor-default">Refund & Rescheduling Policy</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ivory/50">
          <p>© {new Date().getFullYear()} Karmic Ascension. All rights reserved. Bridging Wisdom, Connecting Lives.</p>
          <p className="flex items-center gap-2">
            <span>Built with reverence for Vedic Shastras</span>
            <span aria-hidden="true">•</span>
            <span>Vedic ISO & Ethical Guidelines Compliant</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
