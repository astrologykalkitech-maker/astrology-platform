import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { getMyAssignedLeads } from "@/app/actions/astrologer-leads";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { buttonStyles } from "@/components/astrologer/ui/Button";
import { Card } from "@/components/astrologer/ui/Card";
import { EmptyState, ErrorState } from "@/components/astrologer/ui/feedback";
import { PageHeader } from "@/components/astrologer/ui/PageHeader";
import { AssignmentBadge } from "@/components/astrologer/ui/StatusBadge";
import { getLeadCounts } from "@/lib/astrologer/lead-stats";
import { formatDate, timeAgo } from "@/lib/astrologer/format";
import { requireAstrologerPage } from "@/lib/astrologer/guard";

export const metadata: Metadata = { title: "My Leads" };

const PAGE_SIZE = 10;
const TABS = [
  { key: "all", label: "All" },
  { key: "assigned", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "closed", label: "Closed" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireAstrologerPage();
  const sp = await searchParams;
  const status: TabKey = TABS.some((t) => t.key === sp.status) ? (sp.status as TabKey) : "all";
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);

  const [counts, result] = await Promise.all([
    getLeadCounts(),
    getMyAssignedLeads({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
  ]);

  const href = (s: TabKey, p = 1) => `/astrologer/leads?status=${s}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <>
      <PageHeader title="My Leads" description="Manage your assigned customer enquiries" />

      <nav aria-label="Lead status" className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                active ? "bg-midnight text-champagne shadow-md" : "bg-white text-midnight ring-1 ring-line hover:bg-parchment"
              }`}
            >
              {t.label}{counts ? ` (${counts[t.key]})` : ""}
            </Link>
          );
        })}
      </nav>

      {!result.success ? (
        <ErrorState title="We couldn't load your leads" description={result.error} />
      ) : result.data.leads.length === 0 ? (
        <EmptyState title="No leads here" description="Assigned enquiries for this filter will appear here." />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden overflow-hidden md:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-parchment/70 text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-6 py-3">Name</th>
                  <th scope="col" className="px-3 py-3">Topic</th>
                  <th scope="col" className="px-3 py-3">Assigned</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {result.data.leads.map((item) => {
                  const name = item.lead.customer?.full_name ?? "Customer";
                  return (
                    <tr key={item.id} className="transition-colors hover:bg-parchment/40">
                      <td className="px-6 py-3.5">
                        <span className="flex items-center gap-3"><Avatar name={name} size="sm" /><span className="font-medium text-midnight">{name}</span></span>
                      </td>
                      <td className="max-w-[260px] truncate px-3 py-3.5 text-ink/80">{item.lead.subject}</td>
                      <td className="whitespace-nowrap px-3 py-3.5 text-muted">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-3.5"><AssignmentBadge status={item.status} /></td>
                      <td className="px-6 py-3.5 text-right">
                        <Link href={`/astrologer/leads/${item.id}`} className={buttonStyles({ variant: "outline", size: "sm" })}>View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {result.data.leads.map((item) => {
              const name = item.lead.customer?.full_name ?? "Customer";
              return (
                <li key={item.id}>
                  <Link href={`/astrologer/leads/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-gold/30 bg-white/95 p-3.5 shadow-[0_10px_24px_-20px_rgba(60,35,90,0.5)] active:bg-parchment/60">
                    <Avatar name={name} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate font-semibold text-midnight">{name}</span>
                      <span className="block truncate text-xs text-ink/70">{item.lead.subject}</span>
                      <span className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Clock className="h-3 w-3" aria-hidden="true" />{timeAgo(item.created_at)}</span>
                    </span>
                    <AssignmentBadge status={item.status} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  </Link>
                </li>
              );
            })}
          </ul>

          {(() => {
            const total = result.data.totalCount ?? 0;
            const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            if (pages <= 1) return null;
            return (
              <div className="mt-5 flex items-center justify-between text-sm">
                <p className="text-muted">Page {page} of {pages}</p>
                <div className="flex gap-2">
                  {page > 1 && <Link href={href(status, page - 1)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 ring-1 ring-line hover:bg-parchment"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</Link>}
                  {page < pages && <Link href={href(status, page + 1)} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 ring-1 ring-line hover:bg-parchment">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </>
  );
}
