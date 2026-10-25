import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User, Sparkles, Clock } from "lucide-react";
import { requireCustomerPage } from "@/lib/auth/customer-guard";
import { createClient } from "@/lib/supabase/server";
import { getConsultationMessages } from "@/app/actions/customer";
import { ConsultationThreadClient } from "@/components/customer/ConsultationThreadClient";
import { CustomerReviewForm } from "@/components/customer/CustomerReviewForm";
import { formatExactDateTime } from "@/lib/astrologer/format";
import { CardTitle } from "@/components/astrologer/ui/CardTitle";

export const dynamic = "force-dynamic";

const CARD =
  "relative overflow-hidden rounded-2xl border border-gold/25 bg-white shadow-[0_14px_30px_-22px_rgba(60,35,90,0.5)] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-gold/70 before:to-transparent";

export default async function CustomerEnquiryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, target } = await requireCustomerPage();
  const { id: leadId } = await params;

  const supabase = await createClient(target);

  // Fetch lead with ownership check
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(`
      id,
      customer_id,
      astrologer_id,
      subject,
      message,
      status,
      created_at
    `)
    .eq("id", leadId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (leadErr || !lead) {
    notFound();
  }

  // Resolve astrologer display name
  let astrologerName = "Vedic Astrologer";
  if (lead.astrologer_id) {
    const { data: astro } = await supabase
      .from("astrologer_profiles")
      .select("display_name")
      .eq("id", lead.astrologer_id)
      .maybeSingle();
    if (astro?.display_name) {
      astrologerName = astro.display_name;
    }
  }

  // Fetch messages thread
  const msgResult = await getConsultationMessages(leadId);
  const initialMessages = msgResult.success && msgResult.data ? msgResult.data : [];

  // Fetch review if completed/converted
  let existingReview = null;
  const isCompleted = lead.status === "closed" || lead.status === "converted";
  if (isCompleted) {
    const { getConsultationReview } = await import("@/app/actions/customer");
    const reviewRes = await getConsultationReview(leadId);
    if (reviewRes.success) {
      existingReview = reviewRes.data;
    }
  }

  const displayStatus =
    lead.status === "closed"
      ? "Completed"
      : lead.status === "converted"
      ? "Converted"
      : lead.status === "contacted"
      ? "In Progress"
      : lead.status === "assigned"
      ? "Assigned"
      : "Pending";

  const statusBadge =
    lead.status === "closed"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : lead.status === "assigned" || lead.status === "contacted"
      ? "bg-sky-100 text-sky-800 border-sky-200"
      : "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <div className="space-y-5">
      {/* Back button & Title */}
      <div className="flex items-center gap-3">
        <Link
          href="/customer/enquiries"
          className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gold/30 bg-white text-gold-deep hover:bg-parchment transition-colors"
          aria-label="Back to enquiries"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <CardTitle>Consultation & Direct Guidance</CardTitle>
          <p className="text-xs text-muted">
            Direct communication thread with your assigned Vedic astrologer.
          </p>
        </div>
      </div>

      {/* Review Box for Completed Consultations */}
      {isCompleted && (
        <div className={CARD}>
          <div className="p-5 sm:p-6">
            <CustomerReviewForm
              leadId={leadId}
              initialReview={existingReview}
              astrologerName={astrologerName}
            />
          </div>
        </div>
      )}

      {/* Overview Card */}
      <div className={`${CARD} p-5 sm:p-6 space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-gold/15">
          <div>
            <span className="text-[11px] font-mono text-muted">ID: {lead.id}</span>
            <h2 className="font-display text-lg font-bold text-midnight mt-0.5">
              {lead.subject}
            </h2>
          </div>
          <span
            className={`inline-flex self-start sm:self-center items-center rounded-full border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${statusBadge}`}
          >
            {displayStatus}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="flex items-center gap-2 text-ink">
            <User className="h-4 w-4 text-gold-deep" />
            <span>Astrologer: <strong>{astrologerName}</strong></span>
          </div>
          <div className="flex items-center gap-2 text-muted">
            <Clock className="h-4 w-4 text-gold-deep" />
            <span>Submitted on {formatExactDateTime(lead.created_at)}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-parchment/40 border border-gold/15 text-xs text-ink/80 leading-relaxed whitespace-pre-line">
          <p className="font-semibold text-midnight mb-1">Your Question:</p>
          {lead.message}
        </div>
      </div>

      {/* Discussion & Prediction Thread */}
      <div className={`${CARD} p-5 sm:p-6 space-y-4`}>
        <div className="flex items-center justify-between pb-3 border-b border-gold/15">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-gold-deep" />
            <h3 className="text-sm font-semibold text-midnight">
              Astrologer Predictions & Discussion
            </h3>
          </div>
        </div>

        <ConsultationThreadClient
          leadId={leadId}
          initialMessages={initialMessages}
          astrologerName={astrologerName}
        />
      </div>
    </div>
  );
}
