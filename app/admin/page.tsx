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
    <div className="space-y-6 rise-in">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-midnight via-plum to-midnight p-6 text-white shadow-xl">
        <div className="absolute -right-12 -top-12 h-44 w-44 rounded-full bg-gold/10 blur-2xl pointer-events-none" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/15 px-3 py-0.5 text-[11px] font-semibold text-champagne backdrop-blur-sm mb-2">
              <Shield className="h-3.5 w-3.5 text-gold" />
              <span>Consultant Operations Workspace</span>
            </div>
            <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ivory">
              Consultant Operations Desk
            </h1>
            <p className="text-xs text-parchment/80 mt-1 max-w-xl">
              Welcome back, {profile.full_name ?? "Consultant"}. Your assigned operational workload and delegated capabilities are shown below.
            </p>
          </div>
          <Link
            href="/admin/leads"
            className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-r from-gold to-gold-deep px-4 py-2 text-xs font-semibold text-midnight shadow-md hover:brightness-110 transition-all"
          >
            <Inbox className="h-3.5 w-3.5" />
            View Assigned Leads
          </Link>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Open / Pending Contact</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2">
            <span className="font-serif text-3xl font-bold text-amber-600 dark:text-amber-400">
              {openLeads.length}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">Requires customer outreach</span>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">In Progress (Contacted)</span>
            <UserCheck className="h-4 w-4 text-teal-600" />
          </div>
          <div className="mt-2">
            <span className="font-serif text-3xl font-bold text-teal-600 dark:text-teal-400">
              {contactedLeads.length}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">Active follow-up stage</span>
        </div>

        <div className="rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-semibold uppercase tracking-wider">Completed / Resolved</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2">
            <span className="font-serif text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {closedLeads.length}
            </span>
          </div>
          <span className="text-[11px] text-muted-foreground mt-1 block">Successfully concluded</span>
        </div>
      </div>

      {/* Permissions & Scopes Banner */}
      <div className="rounded-2xl border border-gold/25 bg-white/95 p-6 shadow-sm backdrop-blur-sm dark:bg-midnight/70">
        <h3 className="text-sm font-semibold text-midnight dark:text-ivory flex items-center gap-2 border-b border-gold/15 pb-3">
          <Shield className="h-4 w-4 text-gold" />
          Authorized Operational Capabilities
        </h3>
        <p className="text-xs text-muted-foreground mt-3">
          As a Consultant Admin, your access is strictly bounded by least-privilege security controls. Below are the permissions currently granted to your profile:
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {permissions.length === 0 ? (
            <span className="text-xs text-muted-foreground italic">
              Standard operational scope: assigned customer leads only.
            </span>
          ) : (
            permissions.map((p) => (
              <span
                key={p}
                className="rounded-lg border border-gold/30 bg-parchment/40 px-2.5 py-1 font-mono text-xs font-semibold text-midnight dark:bg-plum/40 dark:text-champagne"
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
          className="group flex items-center justify-between rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-sm backdrop-blur-sm transition-all hover:bg-gold/5 dark:bg-midnight/70 dark:hover:bg-plum/30"
        >
          <div>
            <h4 className="text-sm font-semibold text-midnight dark:text-ivory group-hover:text-gold transition-colors">
              Assigned Leads Workspace
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Review details, record notes, and update consultation outcomes.
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-gold group-hover:translate-x-1 transition-transform" />
        </Link>

        {canReviewListings && (
          <Link
            href="/admin/listings"
            className="group flex items-center justify-between rounded-2xl border border-gold/25 bg-white/95 p-5 shadow-sm backdrop-blur-sm transition-all hover:bg-gold/5 dark:bg-midnight/70 dark:hover:bg-plum/30"
          >
            <div>
              <h4 className="text-sm font-semibold text-midnight dark:text-ivory group-hover:text-gold transition-colors">
                Listing Review Workspace
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review applicant profile submissions and request corrections.
              </p>
            </div>
            <ArrowRight className="h-4 w-4 text-gold group-hover:translate-x-1 transition-transform" />
          </Link>
        )}
      </div>
    </div>
  );
}
