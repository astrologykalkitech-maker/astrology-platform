"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateAssignmentStatus } from "@/app/actions/astrologer-leads";
import { Button } from "@/components/astrologer/ui/Button";
import { FormAlert } from "@/components/astrologer/ui/FormAlert";
import type { AssignmentStatus } from "@/lib/types/database.types";

export function LeadStatusActions({ assignmentId, status }: { assignmentId: string; status: AssignmentStatus }) {
  const router = useRouter();
  const [pending, setPending] = useState<AssignmentStatus | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function change(next: AssignmentStatus) {
    setError(null);
    setSaved(null);
    setPending(next);
    const res = await updateAssignmentStatus({ assignment_id: assignmentId, status: next });
    setPending(null);
    setConfirmClose(false);
    if (!res.success) return setError(res.error);
    setSaved(next === "closed" ? "Lead closed." : "Lead marked as contacted.");
    router.refresh();
  }

  if (status === "closed") {
    return <p className="text-sm text-muted">This lead is closed and can&apos;t be changed.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <FormAlert>{error}</FormAlert>}
      {saved && <FormAlert tone="info">{saved}</FormAlert>}

      {confirmClose ? (
        <div role="alertdialog" aria-label="Confirm closing this lead" className="rounded-xl border border-gold/40 bg-parchment p-4">
          <p className="text-sm text-midnight">Close this lead? This can&apos;t be undone.</p>
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
        <div className="flex flex-col gap-3 sm:flex-row">
          {status === "assigned" && (
            <Button variant="goldLight" onClick={() => change("contacted")} loading={pending === "contacted"} disabled={pending !== null}>
              Mark as Contacted
            </Button>
          )}
          <Button variant="outline" onClick={() => setConfirmClose(true)} disabled={pending !== null}>
            Mark as Closed
          </Button>
        </div>
      )}
    </div>
  );
}
