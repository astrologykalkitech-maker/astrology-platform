import { BarChart3 } from "lucide-react";
import { getPlatformOverviewMetrics } from "@/app/actions/admin-analytics";

export default async function SuperAdminAnalyticsPage() {
  const res = await getPlatformOverviewMetrics();
  const m = res.success
    ? res.data
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

  const conversionRate =
    m.totalLeads > 0 ? Math.round((m.convertedLeads / m.totalLeads) * 100) : 0;
  const assignmentRate =
    m.totalLeads > 0
      ? Math.round(((m.totalLeads - m.unassignedLeads) / m.totalLeads) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-gold" />
          Platform Performance & Analytics
        </h1>
        <p className="text-xs text-zinc-500">
          Transparent metrics aggregated directly from platform database records.
        </p>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Conversion Rate
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {conversionRate}%
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1 block">
            {m.convertedLeads} conversions from {m.totalLeads} total enquiries
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Assignment Rate
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-teal-600 dark:text-teal-400">
              {assignmentRate}%
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1 block">
            {m.totalLeads - m.unassignedLeads} inquiries assigned to consultants
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Unassigned Queue
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-amber-600 dark:text-amber-400">
              {m.unassignedLeads}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1 block">
            Leads waiting in central inbox
          </span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            Directory Roster
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-zinc-900 dark:text-zinc-50">
              {m.approvedListings}
            </span>
          </div>
          <span className="text-[11px] text-zinc-500 mt-1 block">
            Live astrologer directory listings
          </span>
        </div>
      </div>

      {/* Detailed Breakdown Tables */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Lead Pipeline Stages */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 pb-3 dark:border-zinc-800">
            Lead Status Cohorts
          </h3>
          <div className="mt-4 space-y-3">
            {[
              { label: "New (Unprocessed)", count: m.unassignedLeads, color: "bg-amber-500" },
              { label: "Assigned (In Triage)", count: m.assignedLeads, color: "bg-teal-500" },
              { label: "Contacted (Follow-up)", count: m.contactedLeads, color: "bg-indigo-500" },
              { label: "Converted (Consultation)", count: m.convertedLeads, color: "bg-emerald-500" },
              { label: "Closed / Resolved", count: m.closedLeads, color: "bg-zinc-500" },
              { label: "Duplicate Inquiries", count: m.duplicateLeads, color: "bg-rose-400" },
              { label: "Invalid Entries", count: m.invalidLeads, color: "bg-red-500" },
            ].map((cohort) => {
              const pct = m.totalLeads > 0 ? (cohort.count / m.totalLeads) * 100 : 0;

              return (
                <div key={cohort.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {cohort.label}
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {cohort.count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${cohort.color} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Listings Moderation Status */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 pb-3 dark:border-zinc-800">
            Listing Lifecycle Distribution
          </h3>
          <div className="mt-4 space-y-3">
            {[
              { label: "Approved (Active)", count: m.approvedListings, color: "bg-emerald-500" },
              { label: "Pending Verification", count: m.pendingListings, color: "bg-amber-500" },
              { label: "Changes Requested", count: m.changesRequestedListings, color: "bg-orange-500" },
              { label: "Suspended / Delisted", count: m.suspendedListings, color: "bg-rose-500" },
              { label: "Total Applications", count: m.totalListings, color: "bg-zinc-800" },
            ].map((stage) => {
              const pct = m.totalListings > 0 ? (stage.count / m.totalListings) * 100 : 0;

              return (
                <div key={stage.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {stage.label}
                    </span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      {stage.count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3 text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
            <strong>Auditing Standard:</strong> All analytics represent authentic platform counts. No synthetic metrics, projected revenues, or imaginary ROI estimates are rendered.
          </div>
        </div>
      </div>
    </div>
  );
}
