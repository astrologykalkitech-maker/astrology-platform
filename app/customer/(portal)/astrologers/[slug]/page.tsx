import React from "react";
import Link from "next/link";
import { getPublicApprovedAstrologerBySlug } from "@/lib/astrologer/queries";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Languages,
  ShieldCheck,
  Send,
  Star,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Video,
  PhoneCall,
  MessageSquare,
  Lock,
  HeartHandshake,
  Compass,
} from "lucide-react";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function AstrologerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }] = await Promise.all([params, requireCustomerPage()]);
  const astro = await getPublicApprovedAstrologerBySlug(slug);

  if (!astro) {
    return (
      <div className="py-20 text-center space-y-4 max-w-md mx-auto">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-midnight font-display">Astrologer Not Found or Not Available</h1>
        <p className="text-xs text-muted">
          This astrologer profile is currently unavailable or undergoing administrative moderation.
        </p>
        <Link href="/customer/astrologers" className={buttonStyles({ variant: "outline", size: "sm" })}>
          &larr; Browse Active Astrologers
        </Link>
      </div>
    );
  }

  const specializations = astro.specializations || [];
  const languages = astro.languages || [];
  const consultationUrl = `/customer/enquiries/new?astrologerId=${astro.id}&astrologerName=${encodeURIComponent(astro.display_name)}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Back Link */}
      <Link
        href="/customer/astrologers"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gold-deep hover:text-midnight transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Astrologers Directory
      </Link>

      {/* Hero Profile Card */}
      <div className={`${CARD} p-6 sm:p-8 bg-gradient-to-br from-white via-white to-amber-50/30`}>
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <Avatar
            name={astro.display_name}
            src={astro.profile_photo_url}
            size="lg"
            className="!h-28 !w-28 shrink-0 shadow-lg ring-2 ring-gold/30 rounded-2xl"
          />

          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-display font-bold text-midnight truncate">
                {astro.display_name}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Verified Vedic Mentor
              </span>
              {astro.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Featured Mentor
                </span>
              )}
            </div>

            <p className="text-sm font-semibold text-gold-deep">
              {specializations.join(" • ") || "Vedic Astrologer & Kundli Specialist"}
            </p>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
              <span className="inline-flex items-center gap-1.5 font-medium text-midnight">
                <Clock className="h-3.5 w-3.5 text-gold-deep" /> {astro.experience_years ?? 1}+ Years Experience
              </span>
              {astro.city && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-gold-deep" /> {astro.city}
                  {astro.state ? `, ${astro.state}` : ""}
                </span>
              )}
              {languages.length > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="h-3.5 w-3.5 text-gold-deep" /> {languages.join(", ")}
                </span>
              )}
            </div>

            {astro.bio && (
              <p className="text-xs sm:text-sm text-ink/80 leading-relaxed pt-3 border-t border-gold/15">
                {astro.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid: Methodology & Guidance (Left) + Booking & Guarantee (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column (2 Cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Methodology & What to Expect */}
          <div className={`${CARD} p-6 sm:p-7`}>
            <div className="flex items-center gap-2 mb-4">
              <Compass className="h-5 w-5 text-gold-deep" />
              <h2 className="text-lg font-display font-bold text-midnight">
                Vedic Methodology & Chart Analysis
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-muted mb-5 leading-relaxed">
              Every consultation with {astro.display_name} follows authentic Parashari and Jaimini Vedic principles,
              focusing on practical life clarity and traditional remedies rather than fatalistic predictions.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-midnight mb-1.5">
                  <Sparkles className="h-4 w-4 text-gold-deep" />
                  <span>Janam Kundli & D-9 Analysis</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  In-depth evaluation of your Lagna (ascendant), Rashi (Moon sign), Bhava strengths, and Navamsha chart for spiritual and material destiny.
                </p>
              </div>

              <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-midnight mb-1.5">
                  <Clock className="h-4 w-4 text-gold-deep" />
                  <span>Dasha & Gochar Timing</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Precise calculation of Vimshottari Mahadashas and planetary transits (Gochar) to determine favorable windows for major decisions.
                </p>
              </div>

              <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-midnight mb-1.5">
                  <BookOpen className="h-4 w-4 text-gold-deep" />
                  <span>Customized Vedic Upay / Remedies</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Ethical, satvic remedies including customized Vedic mantras, gemstone recommendations, and daan (charity) aligned with planetary afflictions.
                </p>
              </div>

              <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
                <div className="flex items-center gap-2 text-xs font-bold text-midnight mb-1.5">
                  <HeartHandshake className="h-4 w-4 text-gold-deep" />
                  <span>Prashna & Immediate Queries</span>
                </div>
                <p className="text-xs text-muted leading-relaxed">
                  Horary astrological analysis (Prashna Kundli) for acute questions when birth time is uncertain or urgent life guidance is needed.
                </p>
              </div>
            </div>
          </div>

          {/* Consultation Modes & Live Per-Minute Pricing */}
          <div className={`${CARD} p-6 sm:p-7`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-display font-bold text-midnight">
                Consultation Modes & Transparent Per-Minute Pricing
              </h3>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                Pay Direct to Mentor
              </span>
            </div>
            <p className="text-xs text-muted mb-4">
              All online consultation channels are billed strictly per minute. No hidden platform markup—you pay the pandit directly.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="rounded-xl border border-gold/20 bg-white p-4 text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep mb-2">
                  <PhoneCall className="h-5 w-5" />
                </span>
                <p className="text-xs font-bold text-midnight">Voice Call</p>
                <p className="text-base font-display font-bold text-gold-deep mt-1">
                  ₹{astro.voice_price_per_minute ?? 15}<span className="text-[11px] text-muted font-normal">/min</span>
                </p>
                <p className="text-[10px] text-muted mt-1">Billed on billable call duration</p>
              </div>

              <div className="rounded-xl border border-gold/20 bg-white p-4 text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep mb-2">
                  <MessageSquare className="h-5 w-5" />
                </span>
                <p className="text-xs font-bold text-midnight">Live Chat</p>
                <p className="text-base font-display font-bold text-gold-deep mt-1">
                  ₹{astro.chat_price_per_minute ?? 10}<span className="text-[11px] text-muted font-normal">/min</span>
                </p>
                <p className="text-[10px] text-muted mt-1">Continuous live pandit interaction</p>
              </div>

              <div className="rounded-xl border border-gold/20 bg-white p-4 text-center">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold-deep mb-2">
                  <Video className="h-5 w-5" />
                </span>
                <p className="text-xs font-bold text-midnight">Video Darshan</p>
                <p className="text-base font-display font-bold text-gold-deep mt-1">
                  ₹{astro.video_price_per_minute ?? 25}<span className="text-[11px] text-muted font-normal">/min</span>
                </p>
                <p className="text-[10px] text-muted mt-1">Encrypted 1-on-1 visual consultation</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pricing & Quick Booking Action */}
        <div className="space-y-6">
          <div className={`${CARD} p-6 sm:p-7 bg-gradient-to-b from-white to-amber-50/50 sticky top-20`}>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Direct Consultation Rates
            </span>
            <div className="mt-1 flex flex-col gap-1">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-bold text-midnight">
                  ₹{astro.voice_price_per_minute ?? 15} - ₹{astro.video_price_per_minute ?? 25}
                </span>
                <span className="text-xs text-muted">/ min</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-medium">
                Direct customer-to-consultant payment model
              </p>
            </div>

            <ul className="mt-5 space-y-2.5 text-xs text-ink/80 border-t border-gold/15 pt-4">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Full Lagna, Rashi & Kundli Chart Review</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>One-on-One Live Consultation with Mentor</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Written Remedies & Mantras Summary</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Lifetime Access to Consultation Thread</span>
              </li>
            </ul>

            <div className="mt-6">
              <Link
                href={consultationUrl}
                className={buttonStyles({
                  variant: "gold",
                  size: "lg",
                  className: "w-full shadow-md text-center justify-center py-3",
                })}
              >
                <Send className="h-4 w-4 mr-2" /> Send Consultation Request
              </Link>
            </div>

            <div className="mt-6 pt-5 border-t border-gold/15 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-muted">
                <Lock className="h-4 w-4 text-gold-deep shrink-0 mt-0.5" />
                <span>
                  <strong className="text-midnight font-medium">100% Confidential:</strong> Your birth date, time, and coordinates are shared only with this verified mentor.
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-muted">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-midnight font-medium">Verified Credentials:</strong> Identity, years of experience, and credentials vetted by JyotishSetu.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
