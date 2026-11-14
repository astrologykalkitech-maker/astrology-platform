import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import {
  Users,
  FileText,
  ArrowRight,
  Calendar,
  UserCheck,
  AlertTriangle,
  RefreshCw,
  Phone,
  Clock,
  Sparkles,
} from "lucide-react";
import { requireAstrologer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAstrologerCRMAggregate } from "@/lib/astrologer/crm/aggregation";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { PageHeader } from "@/components/astrologer/ui/PageHeader";
import { timeAgo } from "@/lib/astrologer/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Client CRM & Private Notes | JyotishSetu Astrologer Portal",
  description: "Manage private client notes, consultation history, and follow-up reminders.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white p-5 shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] transition-all hover:border-gold/50";

export default async function AstrologerCRMPage() {
  const { user } = await requireAstrologer();
  const admin = await createAdminClient("main");

  // 1. Resolve astrologer profile ID (user_id = authenticated user ID)
  const { data: astroProfile, error: profileErr } = await admin
    .from("astrologer_profiles")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client CRM & Consultation Records"
          description="View your seekers, access private consultation notes, and track follow-up schedules."
        />
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 mb-2" />
          <h3 className="font-semibold text-rose-950">Database Error Resolving Profile</h3>
          <p className="text-sm text-rose-800 mt-1">{profileErr.message}</p>
        </div>
      </div>
    );
  }

  if (!astroProfile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client CRM & Consultation Records"
          description="View your seekers, access private consultation notes, and track follow-up schedules."
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600 mb-2" />
          <h3 className="font-semibold text-amber-950">Astrologer Profile Not Found</h3>
          <p className="text-sm text-amber-800 mt-1">
            Your authenticated account is not currently linked to an active astrologer profile.
          </p>
        </div>
      </div>
    );
  }

  // 1.5. Server-side Entitlement Check: CRM Private Notes is a Professional Feature
  const { hasSubscriptionFeature } = await import("@/lib/financial/entitlements");
  const hasCrmAccess = await hasSubscriptionFeature(astroProfile.id, "crmPrivateNotes");

  if (!hasCrmAccess) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client CRM & Consultation Records"
          description="View your seekers, access private consultation notes, and track follow-up schedules."
        />
        <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-amber-50/80 via-white to-amber-50/30 p-8 text-center max-w-2xl mx-auto shadow-sm">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/20 text-gold-deep mb-4">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-bold text-midnight">Professional Membership Feature</h3>
          <p className="text-xs text-muted mt-2 leading-relaxed max-w-md mx-auto">
            Client CRM, private consultation case notes, and follow-up schedules are exclusive to the <strong>Professional Plan</strong>. Upgrade today to unlock client dossiers, verified leads, and priority ranking.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              href="/astrologer/subscription"
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-[#e0bb6c] to-[#b98a36] px-5 py-2.5 text-xs font-bold text-midnight shadow-md hover:brightness-105 transition"
            >
              <Sparkles className="h-4 w-4" /> Upgrade to Professional
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Fetch robustly aggregated CRM data
  const crmResult = await getAstrologerCRMAggregate(
    admin,
    astroProfile.id,
    astroProfile.display_name || "Astrologer"
  );

  if (!crmResult.success) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Client CRM & Consultation Records"
          description="View your seekers, access private consultation notes, and track follow-up schedules."
        />
        <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-rose-600 mb-2" />
          <h3 className="font-semibold text-rose-950">Unable to Load CRM Records</h3>
          <p className="text-sm text-rose-800 mt-1">{crmResult.error}</p>
          <div className="mt-4">
            <Link
              href="/astrologer/crm"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors shadow-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry Query
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { totalUniqueClients, activeConsultationsCount, totalLeadsAndInquiries, clients } =
    crmResult.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Client CRM & Consultation Records"
        description="View your seekers, access private consultation notes, and track follow-up schedules."
      />

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-gold/30 bg-parchment/60 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-gold-deep">
            <Users className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Total CRM Clients</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-midnight">{totalUniqueClients}</p>
          <p className="text-[11px] text-muted mt-1">Unique seekers with bookings or inquiries</p>
        </div>

        <div className="rounded-2xl border border-gold/30 bg-parchment/60 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-gold-deep">
            <Calendar className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Active Consultations</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-midnight">{activeConsultationsCount}</p>
          <p className="text-[11px] text-muted mt-1">Pending and confirmed scheduled sessions</p>
        </div>

        <div className="rounded-2xl border border-gold/30 bg-parchment/60 p-4 shadow-xs">
          <div className="flex items-center gap-2 text-gold-deep">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Leads & Inquiries</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold text-midnight">{totalLeadsAndInquiries}</p>
          <p className="text-[11px] text-muted mt-1">Direct inquiries & admin lead assignments</p>
        </div>
      </div>

      {/* Client Directory */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-midnight">Client Directory</h3>
          <span className="text-xs text-muted font-medium">
            {clients.length} {clients.length === 1 ? "Seeker record" : "Seeker records"}
          </span>
        </div>

        {clients.length === 0 ? (
          <div className={CARD + " text-center py-12"}>
            <UserCheck className="mx-auto h-9 w-9 text-gold/60" />
            <p className="mt-3 text-sm font-semibold text-midnight">No client records yet</p>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              When seekers book a consultation or submit leads to your profile, their details and history will automatically appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clients.map((client) => {
              const sourceBadge =
                client.source === "both"
                  ? "Bookings & Inquiries"
                  : client.source === "booking"
                  ? "Consultation Client"
                  : "Lead Inquiry";

              return (
                <div key={client.id} className={CARD}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar
                        name={client.name}
                        src={client.avatarUrl || null}
                        size="md"
                        className="shrink-0 mt-0.5"
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold text-midnight truncate">{client.name}</h4>
                        {client.phone && (
                          <p className="text-xs text-muted flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 shrink-0" />
                            <span>{client.phone}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span className="inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-parchment border border-gold/30 text-gold-deep">
                            {sourceBadge}
                          </span>
                          {client.activeBookingsCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800">
                              <Sparkles className="h-2.5 w-2.5" />
                              {client.activeBookingsCount} active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted flex items-center gap-1 mt-2">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>Last active: {timeAgo(client.lastInteraction)}</span>
                        </p>
                      </div>
                    </div>

                    <Link
                      href={`/astrologer/customers/${client.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-gold/40 bg-parchment/60 hover:bg-gold/20 text-xs font-semibold text-midnight transition-colors shrink-0 shadow-2xs"
                    >
                      Open CRM <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
