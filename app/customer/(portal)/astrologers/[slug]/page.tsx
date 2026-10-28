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
} from "lucide-react";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function AstrologerProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireCustomerPage();
  const { slug } = await params;
  const astro = await getPublicApprovedAstrologerBySlug(slug);

  if (!astro) {
    return (
      <div className="py-20 text-center space-y-4">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <h1 className="text-xl font-bold text-midnight">Astrologer Not Found or Not Available</h1>
        <p className="text-xs text-muted max-w-sm mx-auto">
          This astrologer profile is currently unavailable or undergoing administrative moderation.
        </p>
        <Link href="/customer/astrologers" className={buttonStyles({ variant: "outline", size: "sm" })}>
          ← Browse Active Astrologers
        </Link>
      </div>
    );
  }

  const specializations = astro.specializations || [];
  const languages = astro.languages || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link
        href="/customer/astrologers"
        className="inline-flex items-center gap-2 text-xs font-semibold text-gold-deep hover:text-midnight transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Astrologers Directory
      </Link>

      <div className={`${CARD} p-6 sm:p-8`}>
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <Avatar
            name={astro.display_name}
            src={astro.profile_photo_url}
            size="lg"
            className="!h-24 !w-24 shrink-0 shadow-md"
          />

          <div className="flex-1 space-y-3 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-display font-bold text-midnight truncate">
                {astro.display_name}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                <ShieldCheck className="h-3 w-3" /> Verified Vedic Mentor
              </span>
              {astro.is_featured && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Featured
                </span>
              )}
            </div>

            <p className="text-sm font-medium text-gold-deep">
              {specializations.join(" • ") || "Vedic Astrologer"}
            </p>

            <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {astro.experience_years ?? 1}+ Years Experience
              </span>
              {astro.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {astro.city}{astro.state ? `, ${astro.state}` : ""}
                </span>
              )}
              {languages.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Languages className="h-3.5 w-3.5" /> {languages.join(", ")}
                </span>
              )}
            </div>

            {astro.bio && (
              <p className="text-xs text-ink/80 leading-relaxed pt-2 border-t border-gold/15">
                {astro.bio}
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gold/20 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Consultation Fee
            </span>
            <div className="font-display text-2xl font-bold text-midnight">
              ₹{astro.consultation_fee ?? 499}
            </div>
          </div>

          <Link
            href={`/customer/enquiries/new?astrologerId=${astro.id}&astrologerName=${encodeURIComponent(astro.display_name)}`}
            className={buttonStyles({ variant: "gold", size: "lg", className: "w-full sm:w-auto" })}
          >
            <Send className="h-4 w-4 mr-2" /> Send Consultation Request
          </Link>
        </div>
      </div>
    </div>
  );
}