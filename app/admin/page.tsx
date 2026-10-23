import Link from "next/link";
import { Inbox, UserCheck, Clock, CheckCircle2, ArrowRight, Shield } from "lucide-react";
import { requireConsultantAdminPage } from "@/lib/auth/admin-guard";
import { getAdminLeads } from "@/app/actions/admin-leads";

export default async function ConsultantOverviewPage() {
  const { profile, permissions } = await requireConsultantAdminPage();

  // Fetch leads assigned to this consultant
  const leadsRes = await getAdminLeads({ limit: 100 });
  const myLeads = leadsRes.success ? leadsRes.data.leads : [];

  const openLeads = myLeads.filter((l) => l.status === "assigned" || l.status === "new");
  const contactedLeads = myLeads.filter((l) => l.status === "contacted");
  const closedLeads = myLeads.filter((l) => l.status === "closed" || l.status === "converted");

  const canReviewListings = permissions.includes("listing.review");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Consultant Operations Desk
          </h1>
          <p className="text-xs text-zinc-500">
            Welcome back, {profile.full_name ?? "Consultant"}. Your assigned operational workload is shown below.
          </p>
        </div>
        <Link
          href="/admin/leads"
          className="inline-flex items-center gap-1.5 self-start rounded-xl bg-zinc-900 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Inbox className="h-3.5 w-3.5" />
          View My Assigned Leads
        </Link>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Open / Pending Contact</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="font-display text-3xl font-bold text-amber-600 dark:text-amber-400">
              {openLeads.length}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Requires customer outreach</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">In Progress (Contacted)</span>
            <UserCheck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-3xl font-bold text-teal-600 dark:text-teal-400">
              {contactedLeads.length}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Active follow-up stage</span>
        </div>

        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Completed / Resolved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-display text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {closedLeads.length}
            </span>
          </div>
          <span className="text-[11px] text-zinc-400 mt-1 block">Successfully concluded</span>
        </div>
      </div>

      {/* Permissions & Scopes Banner */}
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 border-b border-zinc-100 pb-3 dark:border-zinc-800">
          <Shield className="h-4 w-4 text-teal-600" />
          Authorized Operational Capabilities
        </h3>
        <p className="text-xs text-zinc-500 mt-3">
          As a Consultant Admin, your access is strictly bounded by least-privilege security controls. Below are the permissions currently granted to your profile:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {permissions.length === 0 ? (
            <span className="text-xs text-zinc-400 italic">
              Standard operational scope: assigned customer leads only.
            </span>
          ) : (
            permissions.map((p) => (
              <span
                key={p}
                className="rounded-lg bg-teal-50 border border-teal-200 px-2.5 py-1 font-mono text-xs font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300"
              >
                {p}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href="/admin/leads"
          className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
        >
          <div>
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Assigned Leads Workspace
            </h4>
            <p className="text-xs text-zinc-500 mt-0.5">
              Review details, record notes, and update consultation outcomes.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-zinc-400" />
        </Link>

        {canReviewListings && (
          <Link
            href="/admin/listings"
            className="flex items-center justify-between rounded-2xl border border-zinc-200/80 bg-white p-5 shadow-sm transition-all hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/40"
          >
            <div>
              <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Listing Review Workspace
              </h4>
              <p className="text-xs text-zinc-500 mt-0.5">
                Review applicant profile submissions and request corrections.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-zinc-400" />
          </Link>
        )}
      </div>
    </div>
  );
}
