import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ChevronRight,
  ClipboardList,
  Circle,
  Inbox,
  PencilLine,
  Phone,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { getMyAssignedLeads } from "@/app/actions/astrologer-leads";
import { HeroArt } from "@/components/astrologer/art/HeroArt";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";
import { CompletionRing } from "@/components/astrologer/ui/CompletionRing";
import { EmptyState, ErrorState } from "@/components/astrologer/ui/feedback";
import { StatCard } from "@/components/astrologer/ui/StatCard";
import { ApprovalBadge, AssignmentBadge } from "@/components/astrologer/ui/StatusBadge";
import { formatDate } from "@/lib/astrologer/format";
import { getLeadCounts } from "@/lib/astrologer/lead-stats";
import { getProfileCompletion } from "@/lib/astrologer/profile-completion";
import { getOwnAstrologerProfile, requireAstrologerPage } from "@/lib/astrologer/guard";
import type { ApprovalStatus } from "@/lib/types/database.types";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_TEXT: Record<ApprovalStatus, string> = {
  draft: "Your profile draft is saved. Submit it for review when ready.",
  pending: "Your profile is under review. It will be visible to customers once approved.",
  changes_requested: "The reviewer requested changes to your profile. Please check notes and update.",
  approved: "Your profile is approved and visible to customers.",
  rejected: "Your profile was not approved. Update your details and try again.",
  suspended: "Your listing has been temporarily suspended by platform administration.",
  archived: "Your listing has been archived.",
};

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function DashboardPage() {
  const account = await requireAstrologerPage();
  const { profile, error } = await getOwnAstrologerProfile();

  if (error) {
    return <ErrorState title="We couldn't load your profile" description="Please refresh the page to try again." />;
  }

  if (!profile) {
    return (
      <EmptyState
        title={`Welcome, ${account.full_name ?? "Astrologer"}`}
        description="Create your astrologer profile so customers can find you. It will be reviewed before it goes live."
        action={<Link href="/astrologer/profile/edit" className={buttonStyles()}>Create profile</Link>}
      />
    );
  }

  const [counts, recent] = await Promise.all([getLeadCounts(), getMyAssignedLeads({ status: "all", limit: 4 })]);
  const completion = getProfileCompletion(profile);
  const leads = recent.success ? recent.data.leads : [];

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Hero */}
      <section className="relative isolate min-h-[210px] overflow-hidden rounded-2xl border border-gold/50 bg-midnight shadow-[0_22px_44px_-26px_rgba(21,16,39,0.95)] sm:min-h-[190px]">
        <HeroArt priority />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-midnight/90 via-midnight/55 to-transparent sm:from-midnight/80 sm:via-midnight/35" />
        <span aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-xl border border-gold/30" />
        <div className="relative z-10 max-w-[17rem] px-5 py-5 sm:max-w-lg sm:px-8 sm:py-6">
          <p className="font-display text-base text-champagne sm:text-lg">Welcome back,</p>
          <h1 className="font-display text-2xl font-semibold leading-tight text-ivory sm:text-3xl">{profile.display_name}</h1>
          <p className="mt-1.5 text-sm leading-snug text-ivory/90">
            Continue your divine journey of guiding and helping people with the wisdom of Vedic Astrology.
          </p>
          <Link href="/astrologer/profile/edit" className={buttonStyles({ variant: "goldLight", size: "sm", className: "mt-3.5" })}>
            Edit Profile <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </section>

      {/* Statistics */}
      {counts ? (
        <section aria-label="Lead summary" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard label="Total Leads" value={counts.all} note="All assigned enquiries" icon={Users} tone="bg-gradient-to-br from-violet-100 to-violet-200 text-violet-700 ring-violet-200" surface="from-violet-50" />
          <StatCard label="New Leads" value={counts.assigned} note="Awaiting contact" icon={Inbox} tone="bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 ring-amber-200" surface="from-amber-50" />
          <StatCard label="Contacted" value={counts.contacted} note="In progress" icon={Phone} tone="bg-gradient-to-br from-sky-100 to-sky-200 text-sky-700 ring-sky-200" surface="from-sky-50" />
          <StatCard label="Closed" value={counts.closed} note="Consultations done" icon={ShieldCheck} tone="bg-gradient-to-br from-emerald-100 to-emerald-200 text-emerald-700 ring-emerald-200" surface="from-emerald-50" />
        </section>
      ) : (
        <ErrorState title="We couldn't load your lead summary" description="Please refresh the page to try again." />
      )}

      {/* Profile status + completion */}
      <div className="grid gap-4 sm:gap-5 xl:grid-cols-2">
        <section aria-labelledby="status-title" className={`${CARD} bg-gradient-to-br from-white via-white to-amber-50 p-5 sm:p-6`}>
          <span aria-hidden="true" className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-gold to-maroon" />
          <CardTitle id="status-title">Profile Status</CardTitle>
          <div className="mt-4 flex items-center gap-4 sm:gap-6">
            <span className="shrink-0 rounded-full bg-gradient-to-br from-champagne via-gold to-gold-deep p-[3px] shadow-lg">
              <Avatar name={profile.display_name} src={profile.profile_photo_url} size="xl" className="!h-20 !w-20 ring-2 !ring-white sm:!h-24 sm:!w-24" />
            </span>
            <div className="min-w-0 space-y-2.5">
              <ApprovalBadge status={profile.approval_status} />
              <p className="max-w-sm text-sm leading-snug text-ink/80">{STATUS_TEXT[profile.approval_status]}</p>
              <Link href="/astrologer/profile/edit" className={buttonStyles({ size: "sm" })}>
                <PencilLine className="h-4 w-4" aria-hidden="true" /> Edit Profile
              </Link>
            </div>
          </div>
        </section>

        <section aria-labelledby="completion-title" className={`${CARD} bg-gradient-to-br from-white via-white to-emerald-50/60 p-5 sm:p-6`}>
          <span aria-hidden="true" className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-gradient-to-b from-emerald to-teal" />
          <CardTitle id="completion-title">Profile Completion</CardTitle>
          <div className="mt-4 flex items-center gap-5 sm:gap-8">
            <CompletionRing percent={completion.percent} />
            <ul className="space-y-2 text-sm">
              {completion.items.map((item) => (
                <li key={item.label} className="flex items-center gap-2.5">
                  {item.done ? (
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald text-white"><Check className="h-3 w-3" aria-label="Done" /></span>
                  ) : (
                    <Circle className="h-5 w-5 text-gold/60" aria-label="Missing" />
                  )}
                  <span className={item.done ? "text-ink" : "text-muted"}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {/* Quick actions (before leads on mobile) + recent leads */}
      <div className="grid items-start gap-4 sm:gap-5 xl:grid-cols-[1fr_340px]">
        <section aria-labelledby="qa-title" className={`${CARD} p-5 sm:p-6 xl:order-2`}>
          <CardTitle id="qa-title">Quick Actions</CardTitle>
          <nav aria-label="Quick actions" className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            {[
              { href: "/astrologer/profile/edit", title: "Edit Profile", note: "Update your details", icon: PencilLine, tone: "from-amber-100 to-amber-200 text-amber-700" },
              { href: "/astrologer/leads", title: "My Leads", note: "View all enquiries", icon: ClipboardList, tone: "from-sky-100 to-sky-200 text-sky-700" },
              { href: "/astrologer/profile", title: "My Profile", note: "See how you appear", icon: UserRound, tone: "from-rose-100 to-rose-200 text-maroon" },
            ].map(({ href, title, note, icon: Icon, tone }) => (
              <Link key={href} href={href} className="group flex items-center gap-3 rounded-xl border border-line bg-gradient-to-r from-ivory to-white p-3 transition-all hover:-translate-y-0.5 hover:border-gold/60 hover:shadow-md">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br shadow-inner ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block text-sm font-semibold text-midnight">{title}</span>
                  <span className="block text-xs text-muted">{note}</span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-gold-deep transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            ))}
          </nav>
        </section>

        <section aria-labelledby="recent-title" className={`${CARD} xl:order-1`}>
          <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6">
            <CardTitle id="recent-title">Recent Assigned Leads</CardTitle>
            <Link href="/astrologer/leads" className="inline-flex items-center gap-1 text-sm font-semibold text-gold-deep hover:underline">
              View All <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>

          {!recent.success ? (
            <p role="alert" className="px-6 pb-6 text-sm text-red-600">We couldn&apos;t load your leads.</p>
          ) : leads.length === 0 ? (
            <div className="flex flex-col items-center px-6 pb-8 pt-4 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-parchment to-champagne/60 text-gold-deep ring-1 ring-gold/30">
                <Sparkles className="h-6 w-6" aria-hidden="true" />
              </span>
              <p className="mt-3 font-display text-lg font-semibold text-midnight">No leads yet</p>
              <p className="mt-1 max-w-xs text-sm text-muted">When a customer enquiry is assigned to you, it will appear here.</p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gradient-to-r from-parchment to-parchment/30 text-xs font-semibold uppercase tracking-wide text-maroon/80">
                    <tr>
                      <th scope="col" className="px-6 py-2.5">Name</th>
                      <th scope="col" className="px-3 py-2.5">Concern</th>
                      <th scope="col" className="px-3 py-2.5">Date</th>
                      <th scope="col" className="px-3 py-2.5">Status</th>
                      <th scope="col" className="px-6 py-2.5"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {leads.map((item) => {
                      const name = item.lead.customer?.full_name ?? "Customer";
                      return (
                        <tr key={item.id} className="transition-colors hover:bg-parchment/40">
                          <td className="px-6 py-3 font-semibold text-midnight">{name}</td>
                          <td className="max-w-[180px] truncate px-3 py-3 text-ink/80">{item.lead.subject}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-muted">{formatDate(item.created_at)}</td>
                          <td className="px-3 py-3"><AssignmentBadge status={item.status} /></td>
                          <td className="px-6 py-3 text-right">
                            <Link href={`/astrologer/leads/${item.id}`} className={buttonStyles({ variant: "outline", size: "sm" })}>View</Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="divide-y divide-line md:hidden">
                {leads.map((item) => {
                  const name = item.lead.customer?.full_name ?? "Customer";
                  return (
                    <li key={item.id}>
                      <Link href={`/astrologer/leads/${item.id}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-parchment/50">
                        <Avatar name={name} size="sm" />
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-sm font-semibold text-midnight">{name}</span>
                          <span className="block truncate text-xs text-muted">{item.lead.subject} · {formatDate(item.created_at)}</span>
                        </span>
                        <AssignmentBadge status={item.status} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
