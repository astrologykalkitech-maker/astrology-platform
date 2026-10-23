import Link from "next/link";
import {
  Inbox,
  Clock,
  CheckCircle2,
  AlertCircle,
  Users2,
  UserCheck,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { getPlatformOverviewMetrics } from "@/app/actions/admin-analytics";

export default async function SuperAdminOverviewPage() {
  const metricsResult = await getPlatformOverviewMetrics();
  const metrics = metricsResult.success
    ? metricsResult.data
    : {
        totalLeads: 0,
        leadsToday: 0,
        unassignedLeads: 0,
        assignedLeads: 0,
        contactedLeads: 0,
        convertedLeads: 0,
        closedLeads: 0,
        invalidLeads: 0,
        duplicateLeads: 0,
        platformGeneratedLeads: 0,
        directLeads: 0,
        pendingListings: 0,
        approvedListings: 0,
        changesRequestedListings: 0,
        suspendedListings: 0,
        totalListings: 0,
        activeConsultants: 0,
      };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Platform Command Center
          </h1>
          <p className="text-xs text-zinc-500">
            Live metrics aggregated directly from platform database records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/super-admin/leads"
            className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
          >
            <Inbox className="h-3.5 w-3.5" />
            Central Lead Inbox
          </Link>
          <Link
            href="/super-admin/listings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
          >
            Review Listings
          </Link>
        </div>
      </div>

      {/* Actionable Alerts Banner */}
      {(metrics.pendingListings > 0 || metrics.unassignedLeads > 0) && (
        <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/40 p-4 dark:border-amber-900/40 dark:from-amber-950/20 dark:to-orange-950/10">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                Action Required
              </h4>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                You have{" "}
                {metrics.unassignedLeads > 0 && (
                  <span className="font-bold underline">
                    {metrics.unassignedLeads} unassigned lead{metrics.unassignedLeads === 1 ? "" : "s"}
                  </span>
                )}
                {metrics.unassignedLeads > 0 && metrics.pendingListings > 0 && " and "}
                {metrics.pendingListings > 0 && (
                  <span className="font-bold underline">
                    {metrics.pendingListings} pending listing application{metrics.pendingListings === 1 ? "" : "s"}
                  </span>
                )}{" "}
                awaiting review.
              </p>
            </div>
            <Link
              href={metrics.unassignedLeads > 0 ? "/super-admin/leads?unassignedOnly=true" : "/super-admin/listings"}
              className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
            >
              Take Action
            </Link>
          </div>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Total Leads</span>
            <Inbox className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {metrics.totalLeads}
            </span>
            <span className="text-xs font-medium text-emerald-600 flex items-center">
              +{metrics.leadsToday} today
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Platform pipeline total</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Unassigned Leads</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
              {metrics.unassignedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Awaiting consultant assignment</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Assigned & Active</span>
            <UserCheck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-teal-600 dark:text-teal-400">
              {metrics.assignedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Under consultant follow-up</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Converted Leads</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.convertedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Completed consultations</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Pending Listings</span>
            <Users2 className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
              {metrics.pendingListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Astrologer applications</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Approved Listings</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {metrics.approvedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Live in directory</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Changes Requested</span>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-orange-600 dark:text-orange-400">
              {metrics.changesRequestedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Awaiting applicant update</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Suspended Listings</span>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
              {metrics.suspendedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Temporarily delisted</span>
        </div>
      </div>

      {/* Attribution & Breakdown Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gold" />
              Lead Channel Attribution
            </h3>
            <span className="text-xs text-zinc-400">Live Breakdown</span>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Platform-Generated Enquiries
                </span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {metrics.platformGeneratedLeads} ({metrics.totalLeads > 0 ? Math.round((metrics.platformGeneratedLeads / metrics.totalLeads) * 100) : 0}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full"
                  style={{
                    width: `${metrics.totalLeads > 0 ? (metrics.platformGeneratedLeads / metrics.totalLeads) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  Direct Astrologer Enquiries
                </span>
                <span className="font-bold text-zinc-900 dark:text-zinc-100">
                  {metrics.directLeads} ({metrics.totalLeads > 0 ? Math.round((metrics.directLeads / metrics.totalLeads) * 100) : 0}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-gold rounded-full"
                  style={{
                    width: `${metrics.totalLeads > 0 ? (metrics.directLeads / metrics.totalLeads) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-zinc-400">
            Platform leads route through central inbox first. Direct leads are routed to the specific chosen astrologer while remaining visible in central oversight.
          </p>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Quick Operations
            </h3>
            <span className="text-xs text-zinc-400">Navigation</span>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Link
              href="/super-admin/leads/distribution"
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
            >
              <span>Lead Distribution Rules</span>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
            <Link
              href="/super-admin/listings/ranking"
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
            >
              <span>Ranking & Featured</span>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
            <Link
              href="/super-admin/consultants"
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
            >
              <span>Consultant Permissions</span>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
            <Link
              href="/super-admin/audit-logs"
              className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-xs font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/50"
            >
              <span>Audit Trail Logs</span>
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
