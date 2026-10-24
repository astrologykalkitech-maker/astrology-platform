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
  ArrowRight,
  TrendingUp,
  Tag,
  Mail,
  Calendar,
} from "lucide-react";
import { getPlatformOverviewMetrics } from "@/app/actions/admin-analytics";
import { getAdminLeads } from "@/app/actions/admin-leads";
import { getAdminListings } from "@/app/actions/admin-listings";
import { formatDateTime } from "@/lib/astrologer/format";

export default async function SuperAdminOverviewPage() {
  const [metricsResult, closedLeadsResult, listingsResult] = await Promise.all([
    getPlatformOverviewMetrics(),
    getAdminLeads({ status: "closed", limit: 6 }),
    getAdminListings(),
  ]);

  const astrologerMap = new Map<string, string>();
  if (listingsResult.success) {
    listingsResult.data.listings.forEach((a) => {
      astrologerMap.set(a.id, a.display_name);
    });
  }

  const closedLeads = closedLeadsResult.success ? closedLeadsResult.data.leads : [];

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
        <Link
          href="/super-admin/leads"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
              Total Leads
            </span>
            <Inbox className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-zinc-300" />
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
        </Link>

        <Link
          href="/super-admin/leads?unassignedOnly=true"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-amber-600">
              Unassigned Leads
            </span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
              {metrics.unassignedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Awaiting consultant assignment</span>
        </Link>

        <Link
          href="/super-admin/leads?status=assigned"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-teal-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-teal-600">
              Assigned & Active
            </span>
            <UserCheck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-teal-600 dark:text-teal-400">
              {metrics.assignedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Under consultant follow-up</span>
        </Link>

        <Link
          href="/super-admin/leads?status=converted"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-emerald-600">
              Converted Leads
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metrics.convertedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Completed consultations</span>
        </Link>

        <Link
          href="/super-admin/leads?status=closed"
          className="group rounded-2xl border border-purple-200/90 bg-gradient-to-br from-purple-50/40 via-white to-purple-50/20 p-4 shadow-sm transition-all hover:border-purple-300 hover:shadow-md dark:border-purple-900/40 dark:from-purple-950/20 dark:via-zinc-900 dark:to-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-purple-600 dark:group-hover:text-purple-400">
              Closed Leads
            </span>
            <CheckCircle className="h-4 w-4 text-purple-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-purple-600 dark:text-purple-400">
              {metrics.closedLeads}
            </span>
            <span className="text-[11px] font-medium text-purple-600/80 underline decoration-purple-300">
              View all &rarr;
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Resolved / concluded by astrologer</span>
        </Link>

        <Link
          href="/super-admin/listings?status=pending"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-amber-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-amber-600">
              Pending Listings
            </span>
            <Users2 className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-amber-600 dark:text-amber-400">
              {metrics.pendingListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Astrologer applications</span>
        </Link>

        <Link
          href="/super-admin/listings?status=approved"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-emerald-600">
              Approved Listings
            </span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {metrics.approvedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Live in directory</span>
        </Link>

        <Link
          href="/super-admin/listings?status=changes_requested"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-orange-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-orange-600">
              Changes Requested
            </span>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-orange-600 dark:text-orange-400">
              {metrics.changesRequestedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Awaiting applicant update</span>
        </Link>

        <Link
          href="/super-admin/listings?status=suspended"
          className="group rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm transition-all hover:border-rose-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider group-hover:text-rose-600">
              Suspended Listings
            </span>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-2xl font-bold text-rose-600 dark:text-rose-400">
              {metrics.suspendedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Temporarily delisted</span>
        </Link>
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

      {/* Closed Leads Live Feed Section */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-zinc-100 p-5 dark:border-zinc-800 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-purple-600" />
              Closed & Resolved Consultations
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              Inquiries concluded by astrologers with complete consultation outcomes ({metrics.closedLeads} total records).
            </p>
          </div>
          <Link
            href="/super-admin/leads?status=closed"
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800 self-start sm:self-auto"
          >
            <span>View All Closed Leads</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {closedLeads.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500">
            No closed leads recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-zinc-100 bg-zinc-50/50 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50">
                <tr>
                  <th className="px-5 py-3">Subject / Query</th>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-5 py-3">Assigned Astrologer</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800 font-normal">
                {closedLeads.map((lead) => {
                  const assignedAstroName = lead.astrologer_id
                    ? astrologerMap.get(lead.astrologer_id) ?? "Assigned Astrologer"
                    : "Unassigned";

                  return (
                    <tr
                      key={lead.id}
                      className="transition-colors hover:bg-zinc-50/80 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-5 py-3.5 max-w-[280px]">
                        <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {lead.subject}
                        </div>
                        <div className="text-[11px] text-zinc-400 truncate mt-0.5">
                          {lead.message}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-zinc-600 dark:text-zinc-300">
                        <div className="font-medium text-zinc-800 dark:text-zinc-200">
                          {lead.customer_name ?? "Customer"}
                        </div>
                        {lead.contact_email && (
                          <div className="text-[11px] text-zinc-400 flex items-center gap-1 mt-0.5">
                            <Mail className="h-3 w-3" />
                            {lead.contact_email}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-zinc-700 dark:text-zinc-300">
                        <div className="flex items-center gap-1.5 font-medium">
                          <UserCheck className="h-3.5 w-3.5 text-purple-600" />
                          <span>{assignedAstroName}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${
                            lead.source_type === "direct"
                              ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                              : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                          }`}
                        >
                          <Tag className="h-3 w-3" />
                          {lead.source_type}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/50 dark:border-purple-800/40">
                          <CheckCircle className="h-3 w-3 text-purple-600" />
                          Closed
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right text-[11px] text-zinc-500">
                        <div className="flex items-center justify-end gap-1 font-medium">
                          <Calendar className="h-3 w-3 text-zinc-400" />
                          <span>{formatDateTime(lead.created_at)}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
