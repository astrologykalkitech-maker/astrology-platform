import React from "react";
import Link from "next/link";
import {
  Compass,
  Star,
  MapPin,
  Languages,
  Clock,
  ArrowRight,
  MessageSquarePlus,
  ShieldCheck,
} from "lucide-react";
import { getPublicApprovedAstrologers } from "@/lib/astrologer/queries";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function FindAstrologersPage() {
  const astrologers = await getPublicApprovedAstrologers({ limit: 50 });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Certified Astrologers Directory</CardTitle>
          <p className="text-xs text-muted mt-1">
            Browse our panel of verified Vedic astrologers, numerologists, and spiritual mentors.
          </p>
        </div>
        <Link
          href="/customer/enquiries/new"
          className={buttonStyles({ variant: "outline", size: "sm" })}
        >
          <MessageSquarePlus className="h-4 w-4" /> Ask Platform Directly
        </Link>
      </div>

      {astrologers.length === 0 ? (
        <div className={`${CARD} py-16 px-6 text-center`}>
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold-deep mb-3">
            <Compass className="h-7 w-7" />
          </span>
          <h2 className="text-lg font-semibold text-midnight">No Astrologers Listed Yet</h2>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 mb-5">
            Astrologer profiles are currently undergoing administrative verification. You can still submit general platform consultation enquiries.
          </p>
          <Link href="/customer/enquiries/new" className={buttonStyles({ variant: "gold", size: "sm" })}>
            Submit General Enquiry
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {astrologers.map((astro) => {
            const specializations = astro.specializations || [];
            const languages = astro.languages || [];

            return (
              <div
                key={astro.id}
                className={`${CARD} flex flex-col justify-between p-5 hover:-translate-y-1 hover:shadow-[0_18px_34px_-20px_rgba(60,35,90,0.6)] transition-all`}
              >
                <div>
                  <div className="flex items-start gap-3.5 mb-3">
                    <Avatar
                      name={astro.display_name}
                      src={astro.profile_photo_url}
                      size="md"
                      className="!h-14 !w-14"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h3 className="truncate text-base font-semibold text-midnight">
                          {astro.display_name}
                        </h3>
                        {astro.is_featured && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                            Featured
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-medium text-gold-deep truncate">
                        {specializations[0] || "Vedic Astrologer"}
                      </p>
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-muted">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {astro.experience_years} yrs exp
                        </span>
                        {astro.city && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="h-3 w-3" /> {astro.city}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {astro.bio && (
                    <p className="text-xs text-ink/75 line-clamp-2 mb-3 leading-relaxed">
                      {astro.bio}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-1 mb-4">
                    {specializations.slice(0, 3).map((spec) => (
                      <span
                        key={spec}
                        className="rounded-md border border-gold/20 bg-parchment/60 px-2 py-0.5 text-[10px] font-medium text-ink/80"
                      >
                        {spec}
                      </span>
                    ))}
                    {languages.length > 0 && (
                      <span className="rounded-md border border-teal/20 bg-teal/5 px-2 py-0.5 text-[10px] font-medium text-teal">
                        {languages.join(", ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-gold/15 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-muted uppercase tracking-wider font-semibold">Consultation</p>
                    <p className="font-display text-base font-bold text-midnight">
                      ₹{astro.consultation_fee ?? 499}
                    </p>
                  </div>
                  <Link
                    href={`/customer/enquiries/new?astrologerId=${astro.id}&astrologerName=${encodeURIComponent(astro.display_name)}`}
                    className={buttonStyles({ variant: "gold", size: "sm" })}
                  >
                    Consult <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}