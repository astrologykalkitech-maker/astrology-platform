import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, CheckCheck, Circle, ClipboardList, Eye, Inbox, MessageSquareText, PhoneCall, SquarePen, UserRound } from "lucide-react";
import { getMyAssignedLeads } from "@/app/actions/astrologer-leads";
import { CelestialBackground } from "@/components/astrologer/CelestialBackground";
import { Ornament } from "@/components/astrologer/ui/Ornament";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { Card } from "@/components/astrologer/ui/Card";
import { CompletionRing } from "@/components/astrologer/ui/CompletionRing";
import { EmptyState, ErrorState } from "@/components/astrologer/ui/feedback";
import { StatCard } from "@/components/astrologer/ui/StatCard";
import { ApprovalBadge, AssignmentBadge } from "@/components/astrologer/ui/StatusBadge";
import { getLeadCounts } from "@/lib/astrologer/lead-stats";
import { timeAgo } from "@/lib/astrologer/format";
import { getProfileCompletion } from "@/lib/astrologer/profile-completion";
import { getOwnAstrologerProfile, requireAstrologerPage } from "@/lib/astrologer/guard";

export const metadata: Metadata = { title: "Dashboard" };

const STATUS_TEXT = {
  pending: "Your profile is under review. It will be visible to customers once approved.",
  approved: "Your profile is visible to customers.",
  rejected: "Your profile was not approved. Update your details and try again.",
} as const;

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

  const [counts, recent] = await Promise.all([getLeadCounts(), getMyAssignedLeads({ status: "all", limit: 5 })]);
  const completion = getProfileCompletion(profile);

  return (
    <div className="space-y-6">
      <Card className="relative overflow-hidden border-gold/40 bg-midnight p-6 text-ivory sm:p-9">
        <CelestialBackground variant="cover" />
        <div className="relative max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-champagne">Namaste</p>
          <h1 className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{profile.display_name}</h1>
          <Ornament className="my-3 max-w-[160px]" />
          <p className="text-sm text-ivory/75">Here&apos;s an overview of your practice on JyotishSetu.</p>
        </div>
      </Card>

      {counts ? (
        <section aria-label="Lead summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Leads" value={counts.all} note="All assigned enquiries" icon={MessageSquareText} tone="bg-plum/10 text-plum" />
          <StatCard label="New Leads" value={counts.assigned} note="Awaiting contact" icon={Inbox} tone="bg-gold/15 text-gold-deep" />
          <StatCard label="Contacted" value={counts.contacted} note="In progress" icon={PhoneCall} tone="bg-teal/10 text-teal" />
          <StatCard label="Closed" value={counts.closed} note="Consultations done" icon={CheckCheck} tone="bg-emerald/10 text-emerald" />
        </section>
      ) : (
        <ErrorState title="We couldn't load your lead summary" description="Please refresh the page to try again." />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-midnight">Profile Status</h2>
          <div className="mt-4 flex items-start gap-4">
            <Avatar name={profile.display_name} src={profile.profile_photo_url} size="lg" />
            <div className="space-y-2">
              <ApprovalBadge status={profile.approval_status} />
              <p className="text-sm text-muted">{STATUS_TEXT[profile.approval_status]}</p>
              <Link href="/astrologer/profile/edit" className={buttonStyles({ variant: "outline", size: "sm" })}>
                <SquarePen className="h-4 w-4" aria-hidden="true" /> Edit Profile
              </Link>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden border-gold/40 bg-midnight p-5 text-ivory">
          <CelestialBackground variant="panel" />
          <div className="relative">
            <h2 className="font-display text-lg font-semibold text-champagne">Profile Completion</h2>
            <div className="mt-4 flex items-center gap-5">
              <CompletionRing percent={completion.percent} dark />
              <ul className="space-y-1.5 text-sm">
                {completion.items.map((item) => (
                  <li key={item.label} className="flex items-center gap-2">
                    {item.done ? <CheckCircle2 className="h-4 w-4 text-gold" aria-label="Done" /> : <Circle className="h-4 w-4 text-ivory/40" aria-label="Missing" />}
                    <span className={item.done ? "text-ivory" : "text-ivory/60"}>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between p-5 pb-3">
            <h2 className="font-display text-lg font-semibold text-midnight">Recent Assigned Leads</h2>
            <Link href="/astrologer/leads" className="text-sm font-semibold text-gold-deep hover:underline">View All</Link>
          </div>
          {!recent.success ? (
            <p role="alert" className="p-5 text-sm text-red-600">We couldn&apos;t load your leads.</p>
          ) : recent.data.leads.length === 0 ? (
            <p className="p-5 pt-0 text-sm text-muted">No leads yet. Assigned enquiries will appear here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="bg-ivory text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-semibold">Customer</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Subject</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                    <th scope="col" className="px-5 py-2.5"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {recent.data.leads.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-3">
                        <span className="flex items-center gap-2.5">
                          <Avatar name={item.lead.customer?.full_name ?? "Customer"} size="sm" />
                          <span className="font-medium text-midnight">{item.lead.customer?.full_name ?? "Customer"}</span>
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-3 text-muted">{item.lead.subject}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{timeAgo(item.created_at)}</td>
                      <td className="px-3 py-3"><AssignmentBadge status={item.status} /></td>
                      <td className="px-5 py-3 text-right">
                        <Link href={`/astrologer/leads/${item.id}`} className={buttonStyles({ size: "sm" })}>View</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="font-display text-lg font-semibold text-midnight">Quick Actions</h2>
          <nav aria-label="Quick actions" className="mt-4 flex flex-col gap-2.5">
            {[
              { href: "/astrologer/leads", label: "View All Leads", icon: ClipboardList },
              { href: "/astrologer/profile", label: "View My Profile", icon: Eye },
              { href: "/astrologer/profile/edit", label: "Edit Profile", icon: UserRound },
            ].map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className={buttonStyles({ variant: "outline", size: "md", className: "justify-start" })}>
                <Icon className="h-4 w-4" aria-hidden="true" /> {label}
              </Link>
            ))}
          </nav>
        </Card>
      </div>
    </div>
  );
}
