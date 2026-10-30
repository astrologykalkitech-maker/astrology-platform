import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Sparkles,
  MessageSquare,
  CalendarCheck2,
  Calendar,
  Sun,
  Moon,
  Heart,
  ArrowRight,
  User,
  ShieldCheck,
  Video,
  Clock,
  Compass,
} from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { getCustomerDashboardData, getCustomerBookings } from "@/app/actions/customer";
import { getCustomerConversationsAction } from "@/app/actions/direct-chat";
import { getPublicApprovedAstrologers } from "@/lib/astrologer/queries";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { buttonStyles } from "@/components/astrologer/ui/Button";

export const metadata: Metadata = {
  title: "Seeker Dashboard | JyotishSetu",
  description: "Personalized astrological guidance, bookings, and live consultations.",
};

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function CustomerDashboardPage() {
  const [ctx, dashboardRes, bookingsRes, convosRes, astrologers] = await Promise.all([
    requireCustomerPage(),
    getCustomerDashboardData(),
    getCustomerBookings(),
    getCustomerConversationsAction(),
    getPublicApprovedAstrologers({ limit: 4 }),
  ]);

  const summary = dashboardRes.success && dashboardRes.data ? dashboardRes.data : null;
  const bookings = bookingsRes.success && bookingsRes.data ? bookingsRes.data : [];
  const convos = convosRes.success && convosRes.data ? convosRes.data : [];

  const customerName = ctx.profile.full_name?.trim() || summary?.profile.fullName || "Seeker";

  const upcomingBookings = bookings.filter(
    (b) => b.status === "confirmed" || b.status === "pending"
  );
  const completedBookings = bookings.filter((b) => b.status === "completed");

  const unreadMessagesCount = convos.reduce((acc, c) => acc + (c.unread_count || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Celestial Vedic Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-midnight via-[#24143d] to-midnight p-6 sm:p-8 text-white shadow-xl border border-gold/30">
        <div className="absolute top-0 right-0 w-80 h-80 bg-gold/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold-light">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span>Namaste, {customerName}</span>
              <span className="text-white/40">•</span>
              <span className="text-[11px] text-white/80">Seeker Portal</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Welcome to Your Astrological Sanctuary
            </h1>
            <p className="text-xs sm:text-sm text-white/70 max-w-xl">
              Connect with verified Vedic scholars, review your scheduled consultations, inspect your
              kundli charts, and gain celestial clarity for life decisions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 shrink-0">
            <Link
              href="/customer/astrologers"
              className={buttonStyles({ variant: "gold", size: "sm" })}
            >
              <Sparkles className="h-4 w-4" /> Consult Astrologer
            </Link>
            <Link
              href="/customer/chat"
              className={buttonStyles({ variant: "outline", size: "sm" })}
            >
              <MessageSquare className="h-4 w-4" /> Live Chat
            </Link>
          </div>
        </div>
      </section>

      {/* 2. Key Metrics Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={CARD}>
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium">Upcoming Sessions</span>
            <div className="p-2 rounded-xl bg-gold/10 text-gold-deep">
              <CalendarCheck2 className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-midnight">
            {upcomingBookings.length}
          </div>
          <p className="text-[11px] text-muted mt-1">
            {upcomingBookings.length === 1 ? "1 session scheduled" : `${upcomingBookings.length} sessions scheduled`}
          </p>
        </div>

        <div className={CARD}>
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium">Live Chat Channels</span>
            <div className="p-2 rounded-xl bg-purple-100 text-purple-700">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-midnight">
            {convos.length}
          </div>
          <p className="text-[11px] text-muted mt-1">
            {unreadMessagesCount > 0 ? (
              <span className="text-rose-600 font-semibold">{unreadMessagesCount} unread messages</span>
            ) : (
              "All conversations up to date"
            )}
          </p>
        </div>

        <div className={CARD}>
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium">Completed Readings</span>
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-midnight">
            {completedBookings.length}
          </div>
          <p className="text-[11px] text-muted mt-1">Verified Vedic readings</p>
        </div>

        <div className={CARD}>
          <div className="flex items-center justify-between text-muted mb-2">
            <span className="text-xs font-medium">Available Astrologers</span>
            <div className="p-2 rounded-xl bg-amber-100 text-amber-700">
              <Compass className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-display text-midnight">
            {astrologers.length > 0 ? astrologers.length : "Verified"}
          </div>
          <p className="text-[11px] text-muted mt-1">Ready for online consultation</p>
        </div>
      </section>

      {/* 3. Quick Vedic Services Navigation */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle>Vedic Astrological Services</CardTitle>
          <span className="text-xs text-muted">Instant Tools & Calculators</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Link
            href="/customer/astrologers"
            className="flex flex-col items-center text-center p-3.5 rounded-2xl border border-gold/25 bg-white hover:bg-parchment/60 transition-all shadow-xs group"
          >
            <div className="h-10 w-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-midnight">Astrologers</span>
            <span className="text-[10px] text-muted mt-0.5">Verified Scholars</span>
          </Link>

          <Link
            href="/customer/chat"
            className="flex flex-col items-center text-center p-3.5 rounded-2xl border border-gold/25 bg-white hover:bg-parchment/60 transition-all shadow-xs group"
          >
            <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <MessageSquare className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-midnight">Live Chat</span>
            <span className="text-[10px] text-muted mt-0.5">Instant Messages</span>
          </Link>

          <Link
            href="/customer/panchang"
            className="flex flex-col items-center text-center p-3.5 rounded-2xl border border-gold/25 bg-white hover:bg-parchment/60 transition-all shadow-xs group"
          >
            <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Sun className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-midnight">Daily Panchang</span>
            <span className="text-[10px] text-muted mt-0.5">Tithi & Muhurat</span>
          </Link>

          <Link
            href="/customer/horoscope"
            className="flex flex-col items-center text-center p-3.5 rounded-2xl border border-gold/25 bg-white hover:bg-parchment/60 transition-all shadow-xs group"
          >
            <div className="h-10 w-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Moon className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-midnight">Horoscope</span>
            <span className="text-[10px] text-muted mt-0.5">12 Rashi Forecasts</span>
          </Link>

          <Link
            href="/customer/kundli-milan"
            className="flex flex-col items-center text-center p-3.5 rounded-2xl border border-gold/25 bg-white hover:bg-parchment/60 transition-all shadow-xs group"
          >
            <div className="h-10 w-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <Heart className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-midnight">Kundli Milan</span>
            <span className="text-[10px] text-muted mt-0.5">Ashtakoot Guna</span>
          </Link>

          <Link
            href="/customer/profile"
            className="flex flex-col items-center text-center p-3.5 rounded-2xl border border-gold/25 bg-white hover:bg-parchment/60 transition-all shadow-xs group"
          >
            <div className="h-10 w-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
              <User className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-midnight">My Kundli</span>
            <span className="text-[10px] text-muted mt-0.5">Birth Chart Details</span>
          </Link>
        </div>
      </section>

      {/* 4. Two-Column Dashboard Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Upcoming / Recent Bookings */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle>My Consultations</CardTitle>
            <Link
              href="/customer/bookings"
              className="text-xs font-semibold text-gold-deep hover:underline flex items-center gap-1"
            >
              View all ({bookings.length}) <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {bookings.length === 0 ? (
              <div className={`${CARD} text-center py-10 space-y-3`}>
                <div className="mx-auto h-12 w-12 rounded-2xl bg-gold/15 flex items-center justify-center text-gold-deep">
                  <Calendar className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-display text-sm font-bold text-midnight">No Consultations Yet</h3>
                  <p className="text-xs text-muted max-w-sm mx-auto">
                    Book a live video or chat session with our verified Vedic astrologers for deep horoscope insights.
                  </p>
                </div>
                <Link
                  href="/customer/astrologers"
                  className={buttonStyles({ variant: "gold", size: "sm" })}
                >
                  <Sparkles className="h-4 w-4" /> Book Your First Reading
                </Link>
              </div>
            ) : (
              bookings.slice(0, 4).map((booking) => {
                const isUpcoming = booking.status === "confirmed" || booking.status === "pending";
                return (
                  <div
                    key={booking.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-gold/25 bg-white hover:border-gold transition-all shadow-xs gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center shrink-0 font-bold text-xs">
                        <Video className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-midnight truncate">
                            {booking.astrologer_name || "Vedic Consultation"}
                          </span>
                          <span
                            className={`text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase ${
                              booking.status === "confirmed"
                                ? "bg-emerald-100 text-emerald-800"
                                : booking.status === "completed"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {booking.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-gold-deep" />
                            {new Date(booking.scheduled_at).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <span>•</span>
                          <span className="capitalize">{booking.consultation_mode} session</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isUpcoming ? (
                        <Link
                          href={`/consultation/${booking.id}`}
                          className={buttonStyles({ variant: "gold", size: "sm" })}
                        >
                          Join Room
                        </Link>
                      ) : (
                        <Link
                          href="/customer/bookings"
                          className={buttonStyles({ variant: "outline", size: "sm" })}
                        >
                          Details
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column (5 cols): Active Chat Channels & Verified Astrologers */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <CardTitle>Recent Consultation Chats</CardTitle>
            <Link
              href="/customer/chat"
              className="text-xs font-semibold text-gold-deep hover:underline flex items-center gap-1"
            >
              Open Chat ({convos.length}) <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="rounded-2xl border border-gold/25 bg-white divide-y divide-gold/15 overflow-hidden shadow-xs">
            {convos.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted space-y-2">
                <MessageSquare className="h-6 w-6 text-gold/40 mx-auto" />
                <p>No active chat conversations.</p>
                <Link
                  href="/customer/chat"
                  className="text-xs font-semibold text-gold-deep hover:underline inline-block"
                >
                  Browse Astrologers to Chat &rarr;
                </Link>
              </div>
            ) : (
              convos.slice(0, 4).map((convo) => (
                <Link
                  key={convo.id}
                  href="/customer/chat"
                  className="p-3.5 flex items-center gap-3 hover:bg-parchment/60 transition-colors block"
                >
                  <div className="h-9 w-9 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep flex items-center justify-center font-bold text-xs text-midnight shrink-0">
                    {(convo.astrologer_name || "A").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs text-midnight truncate">
                        {convo.astrologer_name}
                      </span>
                      {convo.unread_count > 0 && (
                        <span className="h-4 min-w-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center">
                          {convo.unread_count}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted truncate mt-0.5">
                      {convo.last_message_preview || "Direct consultation channel"}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>

          {/* Quick Connect Astrologers Box */}
          <div className={`${CARD} bg-gradient-to-br from-parchment/40 to-white space-y-3`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-midnight">Featured Astrologers</span>
              <Link href="/customer/astrologers" className="text-[11px] font-semibold text-gold-deep hover:underline">
                View All
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {astrologers.slice(0, 2).map((astro) => (
                <Link
                  key={astro.id}
                  href={`/customer/astrologers/${astro.slug || astro.id}`}
                  className="p-2.5 rounded-xl border border-gold/20 bg-white hover:border-gold transition-all flex flex-col items-center text-center"
                >
                  <div className="h-10 w-10 rounded-full bg-gold/15 text-gold-deep font-bold text-xs flex items-center justify-center mb-1.5">
                    {astro.display_name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-xs font-bold text-midnight truncate w-full">
                    {astro.display_name}
                  </span>
                  <span className="text-[10px] text-muted mt-0.5">
                    ₹{astro.consultation_fee || 500} / session
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
