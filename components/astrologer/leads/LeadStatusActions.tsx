"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2 } from "lucide-react";
import { updateAssignmentStatus } from "@/app/actions/astrologer-leads";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import { JoinRoomButton } from "@/components/consultation/JoinRoomButton";
import type { AssignmentStatus } from "@/lib/types/database.types";

export function LeadStatusActions({
  assignmentId,
  leadId,
  status,
  customerName,
}: {
  assignmentId: string;
  leadId?: string;
  status: AssignmentStatus;
  customerName?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<AssignmentStatus | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  // Room ID is the lead UUID — used by both customer and astrologer to enter the same room
  const hasRoom = Boolean(leadId) && (status === "contacted" || status === "assigned");

  async function change(next: AssignmentStatus) {
    setError(null);
    setSaved(null);
    setPending(next);
    const res = await updateAssignmentStatus({ assignment_id: assignmentId, status: next });
    setPending(null);
    setConfirmClose(false);
    if (!res.success) return setError(res.error);
    setSaved(
      next === "closed"
        ? "Lead marked as closed."
        : "Lead marked as contacted! You can now start a live consultation or message the customer."
    );
    router.refresh();
  }

  if (status === "closed") {
    return <p className="text-sm text-muted">This lead is closed and can&apos;t be changed.</p>;
  }

  return (
    <div className="space-y-4">
      {error && <FormAlert>{error}</FormAlert>}
      {saved && <FormAlert tone="info">{saved}</FormAlert>}

      {/* Live Voice & Video Consultation Launcher (Active when Contacted or Assigned) */}
      {hasRoom && leadId && (
        <div className="rounded-xl border border-gold/30 bg-gradient-to-br from-parchment/60 to-gold/10 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <h3 className="text-sm font-semibold text-midnight">
              Live Consultation Room (Instant Voice &amp; Video)
            </h3>
          </div>
          <p className="text-xs text-ink/80 mb-3 leading-relaxed">
            Connect immediately with {customerName || "the customer"} via your secure, encrypted consultation room. The customer joins the same room from their enquiry dashboard.
          </p>

          <div className="flex flex-wrap items-center gap-2.5">
            <JoinRoomButton roomId={leadId} role="astrologer" mode="both" />

            <a
              href="/astrologer/bookings"
              className="inline-flex items-center gap-1.5 rounded-xl border border-gold/40 bg-white px-3.5 py-2 text-xs font-semibold text-midnight shadow-sm hover:bg-parchment transition-colors ml-auto"
            >
              <Calendar className="h-3.5 w-3.5 text-gold-deep" />
              View Bookings
            </a>
          </div>
        </div>
      )}


      {confirmClose ? (
        <div role="alertdialog" aria-label="Confirm closing this lead" className="rounded-xl border border-gold/40 bg-parchment p-4">
          <p className="text-sm text-midnight font-medium">Close this lead consultation? This can&apos;t be undone.</p>
          <div className="mt-3 flex gap-3">
            <Button size="sm" onClick={() => change("closed")} loading={pending === "closed"} disabled={pending !== null}>
              Yes, close lead
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmClose(false)} disabled={pending !== null}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {status === "assigned" && (
            <Button variant="goldLight" onClick={() => change("contacted")} loading={pending === "contacted"} disabled={pending !== null}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" />
              Mark as Contacted
            </Button>
          )}

          {status === "contacted" && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Contacted & Active
            </span>
          )}

          <Button variant="outline" onClick={() => setConfirmClose(true)} disabled={pending !== null}>
            Mark as Closed
          </Button>
        </div>
      )}
    </div>
  );
}

