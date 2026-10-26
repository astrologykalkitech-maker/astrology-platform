import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMyAssignedLeadById, getAstrologerLeadMessages } from "@/app/actions/astrologer-leads";
import { LeadStatusActions } from "@/components/astrologer/leads/LeadStatusActions";
import { AstrologerPredictionThreadClient } from "@/components/astrologer/leads/AstrologerPredictionThreadClient";
import { Avatar } from "@/components/astrologer/ui/Avatar";
import { Card } from "@/components/astrologer/ui/Card";
import { ErrorState } from "@/components/astrologer/ui/feedback";
import { AssignmentBadge } from "@/components/astrologer/ui/StatusBadge";
import { formatDateTime } from "@/lib/astrologer/format";
import { requireAstrologerPage } from "@/lib/astrologer/guard";
import { isValidUUID } from "@/lib/validations/lead";
import type { ConsultationMessage } from "@/lib/types/database.types";

export const metadata: Metadata = { title: "Lead Details" };

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAstrologerPage();
  const { id } = await params;
  if (!isValidUUID(id)) notFound();

  const result = await getMyAssignedLeadById(id);
  if (!result.success) {
    if (/not found/i.test(result.error)) notFound();
    return <ErrorState title="We couldn't load this lead" description={result.error} />;
  }

  const item = result.data;
  const name = item.lead.customer?.full_name ?? "Customer";

  // Fetch consultation messages / written predictions
  const msgResult = await getAstrologerLeadMessages(item.lead.id);
  const messages: ConsultationMessage[] =
    msgResult.success && msgResult.data ? (msgResult.data as ConsultationMessage[]) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/astrologer/leads" className="inline-flex items-center gap-2 text-sm font-semibold text-gold-deep hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to leads
      </Link>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={name} size="lg" />
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold text-midnight">{name}</h1>
            <p className="text-sm text-muted">Assigned on {formatDateTime(item.created_at)}</p>
          </div>
          <AssignmentBadge status={item.status} />
        </div>

        <dl className="mt-6 space-y-5 border-t border-line pt-6">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Subject</dt>
            <dd className="mt-1 text-sm text-ink">{item.lead.subject}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Message</dt>
            <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">{item.lead.message}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Received</dt>
            <dd className="mt-1 text-sm text-ink">{formatDateTime(item.lead.created_at)}</dd>
          </div>
        </dl>
      </Card>

      {/* Direct Messaging & Astrological Predictions Thread */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-midnight">Written Prediction & Consultation Thread</h2>
        <AstrologerPredictionThreadClient
          leadId={item.lead.id}
          initialMessages={messages}
          customerName={name}
        />
      </Card>

      <Card className="p-6">
        <h2 className="mb-4 font-display text-lg font-semibold text-midnight">Consultation & Status Controls</h2>
        <LeadStatusActions
          assignmentId={item.id}
          leadId={item.lead.id}
          status={item.status}
          customerName={name}
        />
      </Card>
    </div>
  );
}
