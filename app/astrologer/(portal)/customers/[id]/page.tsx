import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  User,
  Phone,
  Mail,
  CalendarPlus,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Video,
  ExternalLink,
} from "lucide-react";
import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidUUID } from "@/lib/validations/lead";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { Card } from "@/components/astrologer/ui/Card";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { formatDateTime, formatExactDateTime } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Seeker Profile | JyotishSetu Astrologer Portal",
  description: "View Vedic birth details and consultation history for an assigned seeker.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function AstrologerCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireAstrologer();
  const { id: customerId } = await params;

  if (!isValidUUID(customerId)) {
    notFound();
  }

  const admin = await createAdminClient("main");

  // 1. Resolve astrologer profile ID
  const { data: astroProfile, error: astroErr } = await admin
    .from("astrologer_profiles")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (astroErr || !astroProfile) {
    notFound();
  }

  // 2. Authorization check: Astrologer can only view seekers with whom they share a lead or booking
  const [leadsCheck, bookingsCheck] = await Promise.all([
    admin
      .from("leads")
      .select("id")
      .eq("customer_id", customerId)
      .eq("astrologer_id", astroProfile.id)
      .limit(1),
    admin
      .from("customer_bookings")
      .select("id")
      .eq("customer_id", customerId)
      .eq("astrologer_id", astroProfile.id)
      .limit(1),
  ]);

  // Also check lead_assignments
  let hasAssignedLead = (leadsCheck.data && leadsCheck.data.length > 0) || false;
  if (!hasAssignedLead) {
    const { data: assignmentCheck } = await admin
      .from("lead_assignments")
      .select("id, leads!inner(customer_id)")
      .eq("astrologer_id", astroProfile.id)
      .eq("leads.customer_id", customerId)
      .limit(1);

    if (assignmentCheck && assignmentCheck.length > 0) {
      hasAssignedLead = true;
    }
  }

  const hasBooking = (bookingsCheck.data && bookingsCheck.data.length > 0) || false;

  if (!hasAssignedLead && !hasBooking) {
    notFound();
  }

  // 3. Fetch customer profile
  const { data: customer, error: custErr } = await admin
    .from("profiles")
    .select("id, full_name, phone, date_of_birth, time_of_birth, birthplace, gender, avatar_url, created_at")
    .eq("id", customerId)
    .maybeSingle();

  if (custErr || !customer) {
    notFound();
  }

  // 4. Fetch consultation history between this astrologer and customer
  const [enquiriesRes, bookingsRes] = await Promise.all([
    admin
      .from("leads")
      .select("id, subject, message, status, created_at")
      .eq("customer_id", customerId)
      .eq("astrologer_id", astroProfile.id)
      .order("created_at", { ascending: false }),
    admin
      .from("customer_bookings")
      .select("id, service_type, consultation_mode, scheduled_at, duration_minutes, status, price")
      .eq("customer_id", customerId)
      .eq("astrologer_id", astroProfile.id)
      .order("scheduled_at", { ascending: false }),
  ]);

  const customerName = customer.full_name || "Seeker";
  const hasDob = Boolean(customer.date_of_birth);
  const hasTob = Boolean(customer.time_of_birth);
  const hasPlace = Boolean(customer.birthplace?.trim());
  const readinessPercent = Math.round(([hasDob, hasTob, hasPlace].filter(Boolean).length / 3) * 100);

  const newBookingUrl = `/astrologer/bookings/new?customerId=${customer.id}&customerName=${encodeURIComponent(customerName)}&serviceType=Vedic%20Consultation`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Navigation & Header */}
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/astrologer/leads"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gold-deep hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Leads
        </Link>
        <Link
          href={newBookingUrl}
          className={buttonStyles({ variant: "gold", size: "sm" })}
        >
          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Schedule Consultation
        </Link>
      </div>

      {/* Seeker Identity Overview Card */}
      <div className={`${CARD} p-6 sm:p-8 bg-gradient-to-br from-white via-white to-amber-50/40`}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <Avatar
              name={customerName}
              src={customer.avatar_url || null}
              size="lg"
              className="!h-20 !w-20 shadow-md shrink-0"
            />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-2xl font-bold text-midnight">{customerName}</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-champagne/30 px-2.5 py-0.5 text-xs font-semibold text-midnight">
                  <Sparkles className="h-3 w-3 text-gold-deep" /> Verified Seeker
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Member since {new Date(customer.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}
              </p>
              {customer.phone && (
                <p className="text-xs text-midnight font-medium mt-1 flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-gold-deep" /> {customer.phone}
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gold/20 bg-parchment/60 p-4 text-center shrink-0 w-full sm:w-auto">
            <p className="text-xs font-semibold text-midnight">Kundli Readiness</p>
            <p className="text-2xl font-bold font-display text-gold-deep mt-0.5">{readinessPercent}%</p>
            <p className="text-[11px] text-muted mt-0.5">
              {readinessPercent === 100
                ? "Birth coordinates complete for chart calculation"
                : "Ask seeker for exact birth time or place"}
            </p>
          </div>
        </div>
      </div>

      {/* Vedic Birth Details Card */}
      <div className={`${CARD} p-6`}>
        <div className="flex items-center justify-between gap-4 border-b border-gold/20 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-deep shrink-0" />
            <h2 className="font-display text-lg font-semibold text-midnight">
              Vedic Birth Chart Information
            </h2>
          </div>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
              readinessPercent === 100
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-amber-50 text-amber-700 border border-amber-200"
            }`}
          >
            {readinessPercent === 100 ? (
              <>
                <CheckCircle2 className="h-3 w-3" /> Ready for Kundli
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" /> Partial Birth Data
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
              <Calendar className="h-3.5 w-3.5 text-gold-deep" /> Date of Birth
            </span>
            <p className="font-display font-semibold text-midnight text-base mt-1">
              {customer.date_of_birth || "Not specified"}
            </p>
          </div>

          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
              <Clock className="h-3.5 w-3.5 text-gold-deep" /> Time of Birth
            </span>
            <p className="font-display font-semibold text-midnight text-base mt-1">
              {customer.time_of_birth || "Not specified"}
            </p>
          </div>

          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
              <MapPin className="h-3.5 w-3.5 text-gold-deep" /> Place of Birth
            </span>
            <p className="font-display font-semibold text-midnight text-base mt-1 truncate" title={customer.birthplace || undefined}>
              {customer.birthplace || "Not specified"}
            </p>
          </div>

          <div className="rounded-xl border border-gold/15 bg-parchment/30 p-4">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted uppercase tracking-wider">
              <User className="h-3.5 w-3.5 text-gold-deep" /> Gender
            </span>
            <p className="font-display font-semibold text-midnight text-base mt-1 capitalize">
              {customer.gender ? customer.gender.replace(/_/g, " ") : "Not specified"}
            </p>
          </div>
        </div>
      </div>

      {/* Consultation History with this Seeker */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bookings */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gold/20">
            <h3 className="font-display text-base font-semibold text-midnight">Consultation Sessions</h3>
            <span className="text-xs font-medium text-muted">{(bookingsRes.data || []).length} total</span>
          </div>

          {(bookingsRes.data || []).length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No scheduled consultation sessions yet.</p>
          ) : (
            <div className="space-y-3">
              {(bookingsRes.data || []).map((b) => (
                <div key={b.id} className="rounded-xl border border-line bg-parchment/20 p-3 text-xs">
                  <div className="flex items-center justify-between font-semibold text-midnight">
                    <span>{b.service_type || "Vedic Consultation"}</span>
                    <span className="capitalize px-2 py-0.5 rounded-full text-[10px] bg-champagne text-midnight">
                      {b.status}
                    </span>
                  </div>
                  <p className="text-muted mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {formatExactDateTime(b.scheduled_at)} ({b.duration_minutes} min)
                  </p>
                  <p className="text-ink/80 mt-0.5">Mode: {b.consultation_mode} &bull; Fee: ₹{b.price}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assigned Enquiries / Leads */}
        <div className={`${CARD} p-5`}>
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gold/20">
            <h3 className="font-display text-base font-semibold text-midnight">Enquiries & Leads</h3>
            <span className="text-xs font-medium text-muted">{(enquiriesRes.data || []).length} total</span>
          </div>

          {(enquiriesRes.data || []).length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No previous enquiries recorded.</p>
          ) : (
            <div className="space-y-3">
              {(enquiriesRes.data || []).map((l) => (
                <div key={l.id} className="rounded-xl border border-line bg-parchment/20 p-3 text-xs">
                  <div className="flex items-center justify-between font-semibold text-midnight">
                    <span className="truncate max-w-[200px]">{l.subject}</span>
                    <Link
                      href={`/astrologer/leads/${l.id}`}
                      className="text-gold-deep hover:underline text-[11px] font-medium"
                    >
                      View &rarr;
                    </Link>
                  </div>
                  <p className="text-muted mt-1 line-clamp-2">{l.message}</p>
                  <p className="text-[11px] text-muted mt-1">Received {formatDateTime(l.created_at)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

