import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Sparkles,
  User,
  Phone,
  CalendarPlus,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
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
import { buttonStyles } from "@/components/astrologer/ui/Button";

export const metadata: Metadata = { title: "Lead Details | JyotishSetu" };

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
  const customer = item.lead.customer;
  const name = customer?.full_name ?? "Seeker";

  // Calculate Kundli readiness for astrologer chart casting
  const hasDob = Boolean(customer?.date_of_birth);
  const hasTob = Boolean(customer?.time_of_birth);
  const hasPlace = Boolean(customer?.birthplace?.trim());
  const completedFields = [hasDob, hasTob, hasPlace].filter(Boolean).length;
  const readinessPercent = Math.round((completedFields / 3) * 100);

  // Fetch consultation messages / written predictions
  const msgResult = await getAstrologerLeadMessages(item.lead.id);
  const messages: ConsultationMessage[] =
    msgResult.success && msgResult.data ? (msgResult.data as ConsultationMessage[]) : [];

  const bookingUrl = customer?.id
    ? `/astrologer/bookings/new?customerId=${customer.id}&customerName=${encodeURIComponent(name)}&leadId=${item.lead.id}&serviceType=${encodeURIComponent(item.lead.subject || "Vedic Consultation")}`
    : `/astrologer/bookings/new`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          href="/astrologer/leads"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gold-deep hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to leads
        </Link>

        {customer?.id && (
          <Link
            href={`/astrologer/customers/${customer.id}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-gold-deep hover:text-midnight transition-colors"
          >
            <User className="h-3.5 w-3.5" /> View Seeker&apos;s Full Profile &rarr;
          </Link>
        )}
      </div>

      {/* Main Seeker Header Card */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar
              name={name}
              src={customer?.avatar_url || null}
              size="lg"
              className="shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-2xl font-semibold text-midnight truncate">{name}</h1>
                <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-champagne/30 px-2 py-0.5 text-[10px] font-semibold text-midnight">
                  <Sparkles className="h-3 w-3 text-gold-deep" /> Verified Seeker
                </span>
              </div>
              <p className="text-xs text-muted mt-0.5">Assigned on {formatDateTime(item.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
            <AssignmentBadge status={item.status} />
            <Link
              href={bookingUrl}
              className={buttonStyles({
                variant: "gold",
                size: "sm",
                className: "whitespace-nowrap shadow-sm",
              })}
            >
              <CalendarPlus className="h-3.5 w-3.5 mr-1.5" /> Schedule Consultation
            </Link>
          </div>
        </div>

        {/* Lead Enquiry Details */}
        <dl className="mt-6 space-y-4 border-t border-line pt-6">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Consultation Subject</dt>
            <dd className="mt-1 text-sm font-medium text-midnight">{item.lead.subject}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Seeker&apos;s Query / Message</dt>
            <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink bg-parchment/40 rounded-xl p-3 border border-gold/15">
              {item.lead.message}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Received</dt>
            <dd className="mt-1 text-xs text-muted">{formatDateTime(item.lead.created_at)}</dd>
          </div>
        </dl>
      </Card>

      {/* Customer Birth Details & Kundli Readiness Card */}
      <Card className="p-6 bg-gradient-to-br from-white via-white to-amber-50/40">
        <div className="flex items-center justify-between gap-4 border-b border-gold/20 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold-deep shrink-0" />
            <div>
              <h2 className="font-display text-lg font-semibold text-midnight">
                Vedic Birth Details & Kundli Chart Context
              </h2>
              <p className="text-xs text-muted">
                Seeker&apos;s astrological coordinates for casting Lagna, Moon chart & Dashas.
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                readinessPercent === 100
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-amber-50 text-amber-700 border border-amber-200"
              }`}
            >
              {readinessPercent === 100 ? (
                <>
                  <CheckCircle2 className="h-3 w-3" /> Kundli 100% Ready
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3" /> Kundli {readinessPercent}% Complete
                </>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-gold/15 bg-white p-3.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <Calendar className="h-3.5 w-3.5 text-gold-deep" /> Date of Birth
            </span>
            <p className="font-display font-semibold text-midnight text-sm mt-1">
              {customer?.date_of_birth ? customer.date_of_birth : "Not specified"}
            </p>
          </div>

          <div className="rounded-xl border border-gold/15 bg-white p-3.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <Clock className="h-3.5 w-3.5 text-gold-deep" /> Time of Birth
            </span>
            <p className="font-display font-semibold text-midnight text-sm mt-1">
              {customer?.time_of_birth ? customer.time_of_birth : "Not specified"}
            </p>
          </div>

          <div className="rounded-xl border border-gold/15 bg-white p-3.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <MapPin className="h-3.5 w-3.5 text-gold-deep" /> Birth Place
            </span>
            <p className="font-display font-semibold text-midnight text-sm mt-1 truncate" title={customer?.birthplace || undefined}>
              {customer?.birthplace ? customer.birthplace : "Not specified"}
            </p>
          </div>

          <div className="rounded-xl border border-gold/15 bg-white p-3.5">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted uppercase tracking-wider">
              <User className="h-3.5 w-3.5 text-gold-deep" /> Gender
            </span>
            <p className="font-display font-semibold text-midnight text-sm mt-1 capitalize">
              {customer?.gender ? customer.gender.replace(/_/g, " ") : "Not specified"}
            </p>
          </div>
        </div>

        {customer?.phone && (
          <div className="mt-4 pt-3 border-t border-gold/15 flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-gold-deep" /> Contact Phone:{" "}
              <span className="font-mono font-medium text-midnight">{customer.phone}</span>
            </span>
            <span className="text-[11px] text-muted italic">Visible for assigned consultation only</span>
          </div>
        )}
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

      {/* Consultation & Status Controls */}
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
