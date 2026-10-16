import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { getMyAssignedLeads } from "@/app/actions/astrologer-leads";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { Card } from "@/components/astrologer/ui/Card";
import { EmptyState, ErrorState } from "@/components/astrologer/ui/feedback";
import { PageHeader } from "@/components/astrologer/ui/PageHeader";
import { AssignmentBadge } from "@/components/astrologer/ui/StatusBadge";
import { getLeadCounts } from "@/lib/astrologer/lead-stats";
import { timeAgo } from "@/lib/astrologer/format";
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

      <nav aria-label="Lead status" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => {
          const active = t.key === status;
          return (
            <Link
              key={t.key}
              href={href(t.key)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${active ? "gold-gradient text-white" : "bg-white text-midnight ring-1 ring-line hover:bg-parchment"}`}
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
          <Card className="divide-y divide-line">
            {result.data.leads.map((item) => (
              <Link key={item.id} href={`/astrologer/leads/${item.id}`} className="flex items-center gap-4 p-4 transition-colors hover:bg-parchment/50">
                <Avatar name={item.lead.customer?.full_name ?? "Customer"} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-midnight">{item.lead.customer?.full_name ?? "Customer"}</p>
                  <p className="truncate text-sm text-muted">{item.lead.subject}</p>
                </div>
                <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {timeAgo(item.created_at)}
                </span>
                <AssignmentBadge status={item.status} />
                <ChevronRight className="h-4 w-4 text-muted" aria-hidden="true" />
              </Link>
            ))}
          </Card>

          {(() => {
            const total = result.data.totalCount ?? 0;
            const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            if (pages <= 1) return null;
            return (
              <div className="mt-4 flex items-center justify-between text-sm">
                <p className="text-muted">Page {page} of {pages}</p>
                <div className="flex gap-2">
                  {page > 1 && <Link href={href(status, page - 1)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ring-1 ring-line hover:bg-parchment"><ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous</Link>}
                  {page < pages && <Link href={href(status, page + 1)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ring-1 ring-line hover:bg-parchment">Next <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </>
  );
}
