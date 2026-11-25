import { BarChart3, TrendingUp, Sparkles, AlertTriangle } from "lucide-react";
import { getPlatformOverviewMetrics } from "@/app/actions/admin-analytics";

export default async function SuperAdminAnalyticsPage() {
  const res = await getPlatformOverviewMetrics();
  if (!res.success || !res.data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-gold" />
            Platform Performance & Live Telemetry
          </h1>
          <p className="text-xs text-muted">
            Transparent metrics aggregated directly from verified platform database records.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <AlertTriangle className="h-5 w-5 shrink-0 text-red-600 mt-0.5" />
          <div>
            <p className="font-semibold">Unable to load platform analytics</p>
            <p className="text-xs text-red-700 mt-1">
              {res.error || "A database error prevented loading live metrics. Please refresh or check system logs."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const m = res.data;

  const conversionRate =
    m.totalLeads > 0 ? Math.round((m.convertedLeads / m.totalLeads) * 100) : 0;
  const assignmentRate =
    m.totalLeads > 0
      ? Math.round(((m.totalLeads - m.unassignedLeads) / m.totalLeads) * 100)
      : 0;
  const bookingCompletionRate =
    m.totalBookings > 0
      ? Math.round((m.completedBookings / m.totalBookings) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-midnight flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-gold" />
          Platform Performance & Live Telemetry
        </h1>
        <p className="text-xs text-muted">
          Transparent metrics aggregated directly from verified platform database records.
        </p>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Conversion Rate */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Conversion Rate
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-emerald-700">
              {conversionRate}%
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">
            {m.convertedLeads} conversions from {m.totalLeads} total enquiries
          </span>
        </div>

        {/* Assignment Rate */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Assignment Rate
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-teal">
              {assignmentRate}%
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">
            {m.totalLeads - m.unassignedLeads} inquiries assigned to consultants
          </span>
        </div>

        {/* Booking Completion Rate */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Booking Completion
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-purple-700">
              {bookingCompletionRate}%
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">
            {m.completedBookings} completed of {m.totalBookings} scheduled
          </span>
        </div>

        {/* Directory & Seekers Roster */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-xs backdrop-blur-xs">
          <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
            Directory Roster
          </span>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold text-midnight">
              {m.approvedListings}
            </span>
            <span className="text-xs font-semibold text-gold-deep">
              / {m.totalListings} profiles
            </span>
          </div>
          <span className="text-[11px] text-muted mt-1 block">
            {m.totalCustomers} registered seekers on platform
          </span>
        </div>
      </div>

      {/* Detailed Breakdown Tables */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Lead Pipeline Stages */}
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-midnight border-b border-gold/15 pb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-purple-600" />
            Lead Status Cohorts
          </h3>
          <div className="mt-4 space-y-3">
            {[
              { label: "New (Unprocessed)", count: m.unassignedLeads, color: "bg-amber-500" },
              { label: "Assigned (In Triage)", count: m.assignedLeads, color: "bg-teal-500" },
              { label: "Contacted (Follow-up)", count: m.contactedLeads, color: "bg-indigo-500" },
              { label: "Converted (Consultation)", count: m.convertedLeads, color: "bg-emerald-600" },
              { label: "Closed / Resolved", count: m.closedLeads, color: "bg-purple-600" },
              { label: "Duplicate Inquiries", count: m.duplicateLeads, color: "bg-rose-400" },
              { label: "Invalid Entries", count: m.invalidLeads, color: "bg-red-500" },
            ].map((cohort) => {
              const pct = m.totalLeads > 0 ? (cohort.count / m.totalLeads) * 100 : 0;

              return (
                <div key={cohort.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink font-medium">
                      {cohort.label}
                    </span>
                    <span className="font-bold text-midnight">
                      {cohort.count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-parchment overflow-hidden">
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
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-xs backdrop-blur-xs">
          <h3 className="text-xs font-bold uppercase tracking-wider text-midnight border-b border-gold/15 pb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold" />
            Listing Lifecycle Distribution
          </h3>
          <div className="mt-4 space-y-3">
            {[
              { label: "Approved (Active)", count: m.approvedListings, color: "bg-emerald-600" },
              { label: "Pending Verification", count: m.pendingListings, color: "bg-amber-500" },
              { label: "Changes Requested", count: m.changesRequestedListings, color: "bg-orange-500" },
              { label: "Suspended / Delisted", count: m.suspendedListings, color: "bg-rose-500" },
              { label: "Total Applications", count: m.totalListings, color: "bg-midnight" },
            ].map((stage) => {
              const pct = m.totalListings > 0 ? (stage.count / m.totalListings) * 100 : 0;

              return (
                <div key={stage.label}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-ink font-medium">
                      {stage.label}
                    </span>
                    <span className="font-bold text-midnight">
                      {stage.count} ({Math.round(pct)}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-parchment overflow-hidden">
                    <div
                      className={`h-full ${stage.color} rounded-full`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-6 rounded-xl border border-gold/20 bg-parchment/40 p-3 text-xs text-muted">
            <strong>Auditing Standard:</strong> All analytics represent authentic platform counts. No synthetic metrics, projected revenues, or imaginary estimates are rendered.
          </div>
        </div>
      </div>
    </div>
  );
}
