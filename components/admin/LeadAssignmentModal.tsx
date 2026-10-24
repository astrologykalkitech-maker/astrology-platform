"use client";

import { useState, useEffect } from "react";
import { X, UserCheck, AlertCircle, UserMinus } from "lucide-react";
import { assignLead } from "@/app/actions/admin-leads";
import type { AstrologerProfile } from "@/lib/types/database.types";
import type { AdminLeadItem } from "@/app/actions/admin-leads";

interface LeadAssignmentModalProps {
  lead: AdminLeadItem | null;
  eligibleAstrologers: AstrologerProfile[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LeadAssignmentModal({
  lead,
  eligibleAstrologers,
  isOpen,
  onClose,
  onSuccess,
}: LeadAssignmentModalProps) {
  const [selectedAstrologerId, setSelectedAstrologerId] = useState<string>(
    lead?.astrologer_id ?? ""
  );
  const [reason, setReason] = useState("");
  const [isUnassign, setIsUnassign] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Synchronize modal state whenever target lead or open status changes
  useEffect(() => {
    if (lead) {
      setSelectedAstrologerId(lead.astrologer_id ?? "");
      setReason("");
      setIsUnassign(false);
      setError(null);
    }
  }, [lead, isOpen]);

  if (!isOpen || !lead) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const targetId = isUnassign ? null : selectedAstrologerId || null;

    if (!isUnassign && !targetId) {
      setError("Please select an astrologer or choose Unassign.");
      setLoading(false);
      return;
    }

    const res = await assignLead({
      leadId: lead.id,
      astrologerId: targetId,
      reason: reason.trim() || undefined,
    });

    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-4 dark:border-zinc-800">
          <div>
            <h3 className="font-display text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Assign Platform Lead
            </h3>
            <p className="text-xs text-zinc-500">
              Enquiry: <span className="font-medium text-zinc-800 dark:text-zinc-200">{lead.subject}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsUnassign(false)}
              className={`flex-1 rounded-xl border p-2.5 text-xs font-medium flex items-center justify-center gap-2 ${
                !isUnassign
                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Assign to Astrologer
            </button>
            <button
              type="button"
              onClick={() => setIsUnassign(true)}
              className={`flex-1 rounded-xl border p-2.5 text-xs font-medium flex items-center justify-center gap-2 ${
                isUnassign
                  ? "border-rose-900 bg-rose-900 text-white dark:border-rose-200 dark:bg-rose-950 dark:text-rose-100"
                  : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              }`}
            >
              <UserMinus className="h-4 w-4" />
              Unassign Lead
            </button>
          </div>

          {!isUnassign && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                Select Approved Astrologer
              </label>
              <select
                required
                value={selectedAstrologerId}
                onChange={(e) => setSelectedAstrologerId(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
              >
                <option value="">-- Choose Astrologer --</option>
                {eligibleAstrologers.map((astro) => (
                  <option key={astro.id} value={astro.id}>
                    {astro.display_name} ({astro.city ?? "No location"} · {astro.experience_years ?? 0} yrs exp)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
              Assignment Reason / Notes
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Specialty match in Vedic Astrology and Hindi language"
              className="w-full rounded-xl border border-zinc-200 bg-white p-2.5 text-xs text-zinc-900 outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {loading ? "Assigning..." : isUnassign ? "Confirm Unassign" : "Confirm Assignment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
