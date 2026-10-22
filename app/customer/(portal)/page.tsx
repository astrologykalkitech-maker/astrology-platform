import React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Clock,
  Sparkles,
  CheckCircle2,
  CalendarCheck2,
  UserRound,
  ShieldCheck,
  Compass,
  MessageSquarePlus,
  Flame,
  Check,
  Circle,
} from "lucide-react";
import { getCustomerDashboardData } from "@/app/actions/customer";
import { HeroArt } from "@/components/astrologer/art/HeroArt";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { StatCard } from "@/components/astrologer/ui/StatCard";
import { CompletionRing } from "@/components/astrologer/ui/CompletionRing";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function CustomerDashboard() {
  const result = await getCustomerDashboardData();

  if (!result.success || !result.data) {
    return (
      <div className={`${CARD} p-8 text-center`}>
        <h2 className="text-xl font-semibold text-red-600 mb-2">Unable to load customer dashboard</h2>
        <p className="text-sm text-muted mb-5">
          {result.error || "An error occurred while loading your profile data."}
        </p>
        <Link href="/customer" className={buttonStyles({ variant: "gold" })}>
          Retry
        </Link>
      </div>
    );
  }

  const { profile, stats, recentEnquiries } = result.data;

  // Calculate profile completion dynamically
  const profileItems = [
    { label: "Account created", done: true },
    { label: "Display name", done: Boolean(profile.fullName && profile.fullName !== "Customer") },
    { label: "Email verified", done: Boolean(profile.email) },
    { label: "First enquiry or booking", done: stats.totalEnquiries > 0 },
  ];
  const completedCount = profileItems.filter((i) => i.done).length;
  const completionPercent = Math.round((completedCount / profileItems.length) * 100);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* 1. Hero Banner - Exactly matching the user image visual layout */}
      <section className="relative isolate min-h-[210px] overflow-hidden rounded-2xl border border-gold/50 bg-midnight shadow-[0_22px_44px_-26px_rgba(21,16,39,0.95)] sm:min-h-[190px]">
        <HeroArt priority />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-r from-midnight/90 via-midnight/60 to-transparent sm:from-midnight/80 sm:via-midnight/35"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-1 rounded-xl border border-gold/30"
        />
        <div className="relative z-10 max-w-[20rem] px-5 py-5 sm:max-w-xl sm:px-8 sm:py-6">
          <p className="font-display text-base text-champagne sm:text-lg">Welcome back,</p>
          <h1 className="font-display text-2xl font-semibold leading-tight text-ivory sm:text-3xl">
            {profile.fullName}
          </h1>
          <p className="mt-1.5 text-sm leading-snug text-ivory/90">
            Continue your divine journey of seeking guidance and enlightenment with the wisdom of Vedic Astrology.
          </p>
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <Link
              href="/customer/astrologers"
              className={buttonStyles({ variant: "goldLight", size: "sm" })}
            >
              Find Astrologers <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/customer/enquiries/new"
              className={buttonStyles({ variant: "outline", size: "sm", className: "!bg-midnight/70 !text-champagne !border-gold/50 hover:!bg-midnight" })}
            >
              Ask Guidance
            </Link>
          </div>
        </div>
      </section>

      {/* 2. 4 Stat Cards */}
      <section aria-label="Consultation summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label="Total Enquiries"
          value={stats.totalEnquiries}
          note="All submitted queries"
          icon={ClipboardList}
          tone="bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 ring-violet-200"
          surface="from-violet-50"
        />
        <StatCard
          label="Pending Review"
          value={stats.pendingEnquiries}
          note="Awaiting astrologer response"
          icon={Clock}
          tone="bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-amber-200"
          surface="from-amber-50"
        />
        <StatCard
          label="Assigned"
          value={stats.assignedEnquiries}
          note="In consultation progress"
          icon={Sparkles}
          tone="bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700 ring-sky-200"
          surface="from-sky-50"
        />
        <StatCard
          label="Completed"
          value={stats.completedEnquiries}
          note="Consultations finished"
          icon={ShieldCheck}
          tone="bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 ring-emerald-200"
          surface="from-emerald-50"
        />
      </section>

      {/* 3. Account Status & Readiness (Styled symmetrically with Astrologer Portal reference) */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <section
          aria-labelledby="account-status-title"
          className={`${CARD} bg-gradient-to-br from-white via-white to-amber-50/70 p-5 sm:p-6`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-gold to-maroon"
          />
          <CardTitle id="account-status-title">Seeker Status</CardTitle>
          <div className="mt-4 flex items-center gap-4 sm:gap-6">
            <span className="shrink-0 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep p-[3px] shadow-lg">
              <Avatar
                name={profile.fullName}
                size="xl"
                className="!h-20 !w-20 ring-2 !ring-white sm:!h-24 sm:!w-24 text-2xl"
              />
            </span>
            <div className="min-w-0 space-y-2">
              <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald/30 bg-emerald/10 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Active Member
              </div>
              <p className="max-w-sm text-sm leading-snug text-ink/80">
                Your account is active. You have full access to certified astrologers and consultation enquiries.
              </p>
              <div className="pt-1">
                <Link
                  href="/customer/enquiries/new"
                  className={buttonStyles({ size: "sm" })}
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> Submit New Query
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="completion-title"
          className={`${CARD} bg-gradient-to-br from-white via-white to-emerald-50/60 p-5 sm:p-6`}
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-emerald to-teal"
          />
          <CardTitle id="completion-title">Profile Readiness</CardTitle>
          <div className="mt-4 flex items-center gap-5 sm:gap-8">
            <CompletionRing percent={completionPercent} />
            <ul className="space-y-2 text-sm">
              {profileItems.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5">
                  {item.done ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald text-white">
                      <Check className="h-3 w-3" aria-label="Done" />
                    </span>
                  ) : (
                    <Circle className="h-5 w-5 text-gold/60" aria-label="Missing" />
                  )}
                  <span className={item.done ? "text-ink font-medium" : "text-muted"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* 4. Recent Enquiries & Quick Actions */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-3">
        {/* Recent Enquiries Table (2 cols on xl) */}
        <section className={`${CARD} p-5 sm:p-6 xl:col-span-2`}>
          <div className="flex items-center justify-between pb-4 border-b border-gold/20">
            <CardTitle>Recent Consultations & Enquiries</CardTitle>
            <Link
              href="/customer/enquiries"
              className="text-xs font-semibold text-gold-deep hover:text-gold transition-colors inline-flex items-center gap-1"
            >
              View All <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {recentEnquiries.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold-deep mb-3">
                <ClipboardList className="h-6 w-6" />
              </span>
              <p className="text-base font-semibold text-midnight">No consultation requests yet</p>
              <p className="text-xs text-muted max-w-sm mx-auto mt-1 mb-4">
                Ask a question to receive divine astrological analysis regarding career, relationships, health, or finance.
              </p>
              <Link href="/customer/enquiries/new" className={buttonStyles({ size: "sm" })}>
                <MessageSquarePlus className="h-4 w-4" /> Start First Consultation
              </Link>
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gold/15 text-xs font-semibold uppercase tracking-wider text-muted">
                    <th className="py-3 px-2">Subject</th>
                    <th className="py-3 px-2">Astrologer</th>
                    <th className="py-3 px-2">Date</th>
                    <th className="py-3 px-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gold/10">
                  {recentEnquiries.map((enq) => {
                    const statusBadge =
                      enq.status === "new"
                        ? "bg-amber-100 text-amber-800 border-amber-200"
                        : enq.status === "assigned"
                        ? "bg-sky-100 text-sky-800 border-sky-200"
                        : "bg-emerald-100 text-emerald-800 border-emerald-200";

                    const displayDate = new Date(enq.created_at).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });

                    return (
                      <tr key={enq.id} className="hover:bg-parchment/40 transition-colors">
                        <td className="py-3 px-2 font-medium text-midnight max-w-[200px] truncate">
                          {enq.subject}
                        </td>
                        <td className="py-3 px-2 text-ink/80">
                          {enq.astrologer_name || "Platform Panel"}
                        </td>
                        <td className="py-3 px-2 text-xs text-muted whitespace-nowrap">
                          {displayDate}
                        </td>
                        <td className="py-3 px-2 text-right">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${statusBadge}`}
                          >
                            {enq.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Quick Nav / Guidance Shortcuts */}
        <section className={`${CARD} p-5 sm:p-6 space-y-4`}>
          <CardTitle>Divine Services</CardTitle>
          <p className="text-xs text-muted leading-relaxed">
            Direct access to our certified Vedic scholars, daily horoscope guidance, and scheduled bookings.
          </p>

          <div className="space-y-2.5 pt-1">
            <Link
              href="/customer/astrologers"
              className="flex items-center justify-between rounded-xl border border-gold/25 bg-parchment/40 p-3.5 hover:bg-parchment/80 transition-all hover:border-gold/50 group"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold/15 text-gold-deep">
                  <Compass className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-midnight group-hover:text-gold-deep transition-colors">
                    Find Astrologers
                  </p>
                  <p className="text-[11px] text-muted">Browse certified practitioners</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-gold-deep transition-colors" />
            </Link>

            <Link
              href="/customer/bookings"
              className="flex items-center justify-between rounded-xl border border-gold/25 bg-parchment/40 p-3.5 hover:bg-parchment/80 transition-all hover:border-gold/50 group"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald/15 text-emerald">
                  <CalendarCheck2 className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-midnight group-hover:text-emerald transition-colors">
                    My Consultations
                  </p>
                  <p className="text-[11px] text-muted">View scheduled appointments</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-emerald transition-colors" />
            </Link>

            <Link
              href="/customer/offers"
              className="flex items-center justify-between rounded-xl border border-gold/25 bg-parchment/40 p-3.5 hover:bg-parchment/80 transition-all hover:border-gold/50 group"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                  <Flame className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-midnight group-hover:text-violet-700 transition-colors">
                    Special Blessings & Offers
                  </p>
                  <p className="text-[11px] text-muted">Community announcements</p>
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted group-hover:text-violet-700 transition-colors" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}