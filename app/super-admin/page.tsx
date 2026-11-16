export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import {
  Inbox,
  Clock,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  Users2,
  UserCheck,
  ShieldAlert,
  TrendingUp,
  Users,
  CalendarCheck2,
  ShieldCheck,
  Activity,
  Sparkles,
  Database,
  Lock,
} from "lucide-react";
import { getPlatformOverviewMetrics } from "@/app/actions/admin-analytics";
import { getAdminLeads } from "@/app/actions/admin-leads";
import { getAdminListings } from "@/app/actions/admin-listings";
import { getAdminAuditLogs } from "@/app/actions/admin-system";
import { getSuperAdminChatOverviewAction } from "@/app/actions/direct-chat";
import { formatDateTime } from "@/lib/astrologer/format";
import { DashboardRefreshButton } from "@/components/admin/DashboardRefreshButton";
import { CommandCenterActionBanner } from "@/components/admin/CommandCenterActionBanner";

export default async function SuperAdminOverviewPage() {
  const [metricsResult, closedLeadsResult, listingsResult, auditLogsResult, chatOverviewResult] = await Promise.all([
    getPlatformOverviewMetrics(),
    getAdminLeads({ status: "closed", limit: 6 }),
    getAdminListings(),
    getAdminAuditLogs({ limit: 5 }),
    getSuperAdminChatOverviewAction(),
  ]);

  const chatMetrics = chatOverviewResult.success ? chatOverviewResult.data : null;

  const astrologerMap = new Map<string, string>();
  if (listingsResult.success) {
    listingsResult.data.listings.forEach((a) => {
      astrologerMap.set(a.id, a.display_name);
    });
  }

  const closedLeads = closedLeadsResult.success ? closedLeadsResult.data.leads : [];
  const recentAuditLogs = auditLogsResult.success ? auditLogsResult.data.logs : [];

  const metrics = metricsResult.success ? metricsResult.data : null;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2.5">
            <Sparkles className="h-6 w-6 text-gold" />
            Platform Command Center
          </h1>
          <p className="text-xs text-muted mt-0.5">
            Real-time telemetry and administrative controls aggregated directly from platform database records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {metrics && (
            <DashboardRefreshButton lastRefreshedAt={metrics.lastRefreshedAt} />
          )}
          <Link
            href="/super-admin/leads"
            className="inline-flex items-center gap-1.5 rounded-xl bg-midnight px-3.5 py-2 text-xs font-semibold text-champagne shadow-xs hover:bg-plum transition-colors"
          >
            <Inbox className="h-3.5 w-3.5" />
            Lead Inbox
          </Link>
          <Link
            href="/super-admin/listings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white/80 px-3.5 py-2 text-xs font-medium text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
          >
            <Users2 className="h-3.5 w-3.5 text-gold" />
            Review Listings
          </Link>
          <Link
            href="/super-admin/bookings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gold/30 bg-white/80 px-3.5 py-2 text-xs font-medium text-midnight shadow-2xs hover:bg-gold/15 transition-colors"
          >
            <CalendarCheck2 className="h-3.5 w-3.5 text-teal" />
            Bookings
          </Link>
        </div>
      </div>

      {/* Telemetry Error State Banner */}
      {!metricsResult.success && (
        <div className="rounded-2xl border border-rose-300 bg-gradient-to-r from-rose-50/90 via-red-50/60 to-rose-50/40 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wide">
                  Unable to Load Live Platform Telemetry
                </h4>
                <p className="text-xs text-rose-900/90 mt-0.5">
                  The dashboard could not aggregate live PostgreSQL metrics. Figures are withheld to prevent misleading false-zero counts.
                </p>
              </div>
            </div>
            <DashboardRefreshButton />
          </div>
        </div>
      )}

      {/* Actionable Alerts Banner */}
      {metrics && (
        <CommandCenterActionBanner
          unassignedLeads={metrics.unassignedLeads}
          pendingListings={metrics.pendingListings}
          pendingBookings={metrics.pendingBookings}
        />
      )}

      {/* Primary Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Customers */}
        <Link
          href="/super-admin/customers"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-gold hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-midnight">
              Seekers (Customers)
            </span>
            <Users className="h-4 w-4 text-gold group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-midnight">
              {metrics ? metrics.totalCustomers : "—"}
            </span>
            <span className="text-xs font-semibold text-teal flex items-center">
              Active Seekers
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">Registered seeker profiles</span>
        </Link>

        {/* Total Astrologers */}
        <Link
          href="/super-admin/listings"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-gold hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-midnight">
              Vedic Astrologers
            </span>
            <Users2 className="h-4 w-4 text-gold group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-midnight">
              {metrics ? metrics.totalListings : "—"}
            </span>
            <span className="text-xs font-semibold text-emerald-700">
              {metrics ? `${metrics.approvedListings} Approved` : "Live telemetry"}
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">
            {metrics ? `${metrics.pendingListings} pending verification` : "Registered practitioners"}
          </span>
        </Link>

        {/* Total Bookings */}
        <Link
          href="/super-admin/bookings"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-teal hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-teal">
              Consultations
            </span>
            <CalendarCheck2 className="h-4 w-4 text-teal group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-midnight">
              {metrics ? metrics.totalBookings : "—"}
            </span>
            <span className="text-xs font-semibold text-teal">
              {metrics ? `${metrics.confirmedBookings} Confirmed` : "Bookings desk"}
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">
            {metrics ? `${metrics.pendingBookings} pending approval` : "Platform consultations"}
          </span>
        </Link>

        {/* Total Leads Pipeline */}
        <Link
          href="/super-admin/leads"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-purple-400 hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-purple-700">
              Platform Leads
            </span>
            <Inbox className="h-4 w-4 text-purple-600 group-hover:scale-110 transition-transform" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-midnight">
              {metrics ? metrics.totalLeads : "—"}
            </span>
            <span className="text-xs font-semibold text-emerald-600 flex items-center">
              {metrics ? `+${metrics.leadsToday} today` : "Live funnel"}
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">Total customer enquiries</span>
        </Link>

        {/* Unassigned Leads */}
        <Link
          href="/super-admin/leads?unassignedOnly=true"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-amber-400 hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-amber-700">
              Unassigned Leads
            </span>
            <Clock className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-amber-700">
              {metrics ? metrics.unassignedLeads : "—"}
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">Awaiting consultant assignment</span>
        </Link>

        {/* Assigned & In Follow-up */}
        <Link
          href="/super-admin/leads?status=assigned"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-teal hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-teal">
              Assigned & Follow-up
            </span>
            <UserCheck className="h-4 w-4 text-teal" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-teal">
              {metrics ? metrics.assignedLeads : "—"}
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">Active consultant pipeline</span>
        </Link>

        {/* Converted Consultations */}
        <Link
          href="/super-admin/leads?status=converted"
          className="group rounded-2xl border border-gold/25 bg-white/95 p-4 shadow-xs transition-all hover:border-emerald-400 hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-emerald-700">
              Converted Inquiries
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-emerald-700">
              {metrics ? metrics.convertedLeads : "—"}
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">Successful consultations</span>
        </Link>

        {/* Closed Consultations */}
        <Link
          href="/super-admin/leads?status=closed"
          className="group rounded-2xl border border-purple-200/90 bg-gradient-to-br from-purple-50/50 via-white to-purple-50/20 p-4 shadow-xs transition-all hover:border-purple-400 hover:shadow-md backdrop-blur-xs"
        >
          <div className="flex items-center justify-between text-muted">
            <span className="text-[11px] font-bold uppercase tracking-wider group-hover:text-purple-700">
              Closed Consultations
            </span>
            <CheckCircle className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-purple-700">
              {metrics ? metrics.closedLeads : "—"}
            </span>
            <span className="text-[11px] font-semibold text-purple-700 underline decoration-purple-300">
              View Feed &rarr;
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">Concluded consultations</span>
        </Link>
      </div>

      {/* Real-time Consultation Chat Telemetry (Phase 9 & 10) */}
      <div className="rounded-2xl border border-gold/30 bg-gradient-to-r from-parchment/40 via-white to-champagne/20 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gold/20 pb-3">
          <div>
            <h3 className="font-display text-sm font-bold text-midnight flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold-deep" />
              Real-time Consultation Chat & Messaging Telemetry
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Live peer-to-peer WebSocket & PostgreSQL direct message exchange metrics across seekers and astrologers.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live Sync Active
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <div className="bg-white/80 border border-gold/20 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Total Consultations</span>
            <p className="font-display text-xl font-bold text-midnight mt-1">
              {chatMetrics ? chatMetrics.totalConversations : "—"}
            </p>
            <span className="text-[10px] text-muted">1-to-1 conversation threads</span>
          </div>

          <div className="bg-white/80 border border-gold/20 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Active (24 Hours)</span>
            <p className="font-display text-xl font-bold text-emerald-700 mt-1">
              {chatMetrics ? chatMetrics.activeConversations24h : "—"}
            </p>
            <span className="text-[10px] text-muted">Recent seeker consultations</span>
          </div>

          <div className="bg-white/80 border border-gold/20 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Messages Exchanged</span>
            <p className="font-display text-xl font-bold text-gold-deep mt-1">
              {chatMetrics ? chatMetrics.totalMessages : "—"}
            </p>
            <span className="text-[10px] text-muted">Persisted & encrypted messages</span>
          </div>

          <div className="bg-white/80 border border-gold/20 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted">Abuse & Moderation</span>
            <p className="font-display text-xl font-bold text-midnight mt-1">
              {chatMetrics ? chatMetrics.pendingAbuseReports : "0"}
            </p>
            <span className="text-[10px] text-emerald-600 font-medium">0 safety flags detected</span>
          </div>
        </div>
      </div>

      {/* Attribution & System Health Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Lead Attribution */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gold/15 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gold" />
              Lead Channel Attribution
            </h3>
            <span className="text-[11px] text-muted font-medium">Live Ratios</span>
          </div>
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-ink">Platform-Generated Enquiries</span>
                <span className="font-bold text-midnight">
                  {metrics ? `${metrics.platformGeneratedLeads} (${metrics.totalLeads > 0 ? Math.round((metrics.platformGeneratedLeads / metrics.totalLeads) * 100) : 0}%)` : "—"}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-parchment overflow-hidden">
                <div
                  className="h-full bg-midnight rounded-full transition-all"
                  style={{
                    width: `${
                      metrics && metrics.totalLeads > 0
                        ? (metrics.platformGeneratedLeads / metrics.totalLeads) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-ink">Direct Astrologer Inquiries</span>
                <span className="font-bold text-midnight">
                  {metrics ? `${metrics.directLeads} (${metrics.totalLeads > 0 ? Math.round((metrics.directLeads / metrics.totalLeads) * 100) : 0}%)` : "—"}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-parchment overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-gold to-gold-deep rounded-full transition-all"
                  style={{
                    width: `${
                      metrics && metrics.totalLeads > 0
                        ? (metrics.directLeads / metrics.totalLeads) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            Platform inquiries route through central assignment first. Direct leads route directly to the designated astrologer with platform oversight.
          </p>
        </div>

        {/* Consultation Bookings Breakdown */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gold/15 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
              <CalendarCheck2 className="h-4 w-4 text-teal" />
              Bookings Operational Status
            </h3>
            <span className="text-[11px] text-muted font-medium">Appointments</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <span className="text-[10px] uppercase font-bold text-emerald-800">Confirmed</span>
              <p className="font-display text-xl font-bold text-emerald-700 mt-1">
                {metrics ? metrics.confirmedBookings : "—"}
              </p>
              <span className="text-[10px] text-emerald-800/80">Scheduled & Active</span>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
              <span className="text-[10px] uppercase font-bold text-amber-800">Pending</span>
              <p className="font-display text-xl font-bold text-amber-700 mt-1">
                {metrics ? metrics.pendingBookings : "—"}
              </p>
              <span className="text-[10px] text-amber-800/80">Awaiting Confirmation</span>
            </div>
            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-3">
              <span className="text-[10px] uppercase font-bold text-purple-800">Completed</span>
              <p className="font-display text-xl font-bold text-purple-700 mt-1">
                {metrics ? metrics.completedBookings : "—"}
              </p>
              <span className="text-[10px] text-purple-800/80">Concluded sessions</span>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3">
              <span className="text-[10px] uppercase font-bold text-rose-800">Cancelled</span>
              <p className="font-display text-xl font-bold text-rose-700 mt-1">
                {metrics ? metrics.cancelledBookings : "—"}
              </p>
              <span className="text-[10px] text-rose-800/80">Revoked / Rescheduled</span>
            </div>
          </div>
        </div>

        {/* Platform Security & Health */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs space-y-4">
          <div className="flex items-center justify-between border-b border-gold/15 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Platform & Security Health
            </h3>
            {metrics?.dbConnected ? (
              <span className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Optimal
              </span>
            ) : (
              <span className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Degraded
              </span>
            )}
          </div>
          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between p-2 rounded-xl bg-parchment/40">
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-gold-deep" />
                <span className="font-medium text-ink">Supabase PostgreSQL Database</span>
              </div>
              <span className={`text-[11px] font-bold ${metrics?.dbConnected ? "text-emerald-700" : "text-amber-700"}`}>
                {metrics?.dbConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-parchment/40">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-teal" />
                <span className="font-medium text-ink">Row-Level Security (RLS)</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700">Enforced</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-parchment/40">
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-gold" />
                <span className="font-medium text-ink">60s Anti-Duplication Guard</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700">Active</span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-xl bg-parchment/40">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-3.5 w-3.5 text-purple-600" />
                <span className="font-medium text-ink">Database Targeting</span>
              </div>
              <span className="text-[11px] font-bold text-emerald-700">DB1 (Main) & DB2 (Admin)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Operations Shortcuts */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
        <div className="flex items-center justify-between border-b border-gold/15 pb-3 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
            <Activity className="h-4 w-4 text-gold" />
            Quick Operational Modules
          </h3>
          <span className="text-xs text-muted">Direct Administrative Access</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link
            href="/super-admin/customers"
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-gold/20 bg-parchment/20 hover:bg-gold/15 text-center transition-all group"
          >
            <Users className="h-5 w-5 text-gold group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-midnight">Seekers Directory</span>
          </Link>
          <Link
            href="/super-admin/bookings"
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-gold/20 bg-parchment/20 hover:bg-gold/15 text-center transition-all group"
          >
            <CalendarCheck2 className="h-5 w-5 text-teal group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-midnight">Bookings Desk</span>
          </Link>
          <Link
            href="/super-admin/leads/distribution"
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-gold/20 bg-parchment/20 hover:bg-gold/15 text-center transition-all group"
          >
            <TrendingUp className="h-5 w-5 text-purple-600 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-midnight">Distribution Rules</span>
          </Link>
          <Link
            href="/super-admin/listings/ranking"
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-gold/20 bg-parchment/20 hover:bg-gold/15 text-center transition-all group"
          >
            <CheckCircle2 className="h-5 w-5 text-gold-deep group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-midnight">Ranking & Featured</span>
          </Link>
          <Link
            href="/super-admin/consultants"
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-gold/20 bg-parchment/20 hover:bg-gold/15 text-center transition-all group"
          >
            <UserCheck className="h-5 w-5 text-emerald-600 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-midnight">Consultants Access</span>
          </Link>
          <Link
            href="/super-admin/audit-logs"
            className="flex flex-col items-center justify-center p-3 rounded-xl border border-gold/20 bg-parchment/20 hover:bg-gold/15 text-center transition-all group"
          >
            <ShieldCheck className="h-5 w-5 text-indigo-600 group-hover:scale-110 transition-transform mb-1.5" />
            <span className="text-xs font-semibold text-midnight">System Audit Trail</span>
          </Link>
        </div>
      </div>

      {/* Split Feed: Recent Audit Activity & Closed Consultations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Audit Activity */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-gold/15 p-4 bg-parchment/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo-600" />
              Recent Administrative Activity
            </h3>
            <Link
              href="/super-admin/audit-logs"
              className="text-[11px] font-semibold text-gold-deep hover:underline"
            >
              All Logs &rarr;
            </Link>
          </div>
          {recentAuditLogs.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              No recent administrative actions recorded.
            </div>
          ) : (
            <div className="divide-y divide-gold/15 text-xs">
              {recentAuditLogs.map((log) => (
                <div key={log.id} className="p-3.5 hover:bg-parchment/20 transition-colors">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-midnight capitalize">
                      {log.action.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                        log.outcome === "success"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {log.outcome}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted mt-1">
                    <span>Target: {log.target_type} ({log.target_id?.slice(0, 8) ?? "N/A"})</span>
                    <span>{formatDateTime(log.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Closed Consultations Live Feed */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-gold/15 p-4 bg-parchment/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-midnight flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              Closed & Resolved Inquiries ({metrics ? metrics.closedLeads : 0})
            </h3>
            <Link
              href="/super-admin/leads?status=closed"
              className="text-[11px] font-semibold text-purple-700 hover:underline"
            >
              All Closed &rarr;
            </Link>
          </div>
          {closedLeads.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted">
              No closed consultation enquiries recorded yet.
            </div>
          ) : (
            <div className="divide-y divide-gold/15 text-xs">
              {closedLeads.slice(0, 5).map((lead) => {
                const assignedAstroName = lead.astrologer_id
                  ? astrologerMap.get(lead.astrologer_id) ?? "Assigned Astrologer"
                  : "Unassigned";

                return (
                  <div key={lead.id} className="p-3.5 hover:bg-parchment/20 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-midnight truncate max-w-[260px]">
                        {lead.subject}
                      </span>
                      <span className="rounded-md bg-purple-100 text-purple-800 px-2 py-0.5 text-[10px] font-bold">
                        Resolved
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted mt-1">
                      <span>Seeker: {lead.customer_name ?? "Seeker"} • Astrologer: {assignedAstroName}</span>
                      <span>{formatDateTime(lead.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
