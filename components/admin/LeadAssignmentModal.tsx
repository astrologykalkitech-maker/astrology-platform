"use client";

import { useState, useEffect } from "react";
import { X, UserCheck, AlertCircle, UserMinus, Sparkles } from "lucide-react";
import { assignLead } from "@/app/actions/admin-leads";
import type { AstrologerProfile } from "@/lib/types/database.types";
import type { AdminLeadItem } from "@/app/actions/admin-leads";
import { ModalBackdrop } from "@/components/admin/ModalBackdrop";

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
    <ModalBackdrop
      isOpen={isOpen}
      onClose={onClose}
      backdropBgClass="bg-midnight/80"
      backdropBlurClass="backdrop-blur-xs"
      ariaLabel="Assign Lead to Astrologer"
    >
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl text-ink space-y-4 my-auto animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-gold/20 pb-3">
          <div>
            <h3 className="font-display text-base font-bold text-midnight flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" />
              Assign Consultation Lead
            </h3>
            <p className="text-xs text-muted">
              Subject: <span className="font-semibold text-midnight">{lead.subject}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="rounded-lg p-1 text-muted hover:bg-gold/15 hover:text-midnight transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsUnassign(false)}
              className={`flex-1 rounded-xl border p-2.5 text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                !isUnassign
                  ? "border-midnight bg-midnight text-champagne shadow-sm"
                  : "border-gold/25 bg-white text-muted hover:bg-gold/10 hover:text-midnight"
              }`}
            >
              <UserCheck className="h-4 w-4" />
              Assign to Astrologer
            </button>
            <button
              type="button"
              onClick={() => setIsUnassign(true)}
              className={`flex-1 rounded-xl border p-2.5 text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                isUnassign
                  ? "border-rose-700 bg-rose-700 text-white shadow-sm"
                  : "border-gold/25 bg-white text-muted hover:bg-gold/10 hover:text-midnight"
              }`}
            >
              <UserMinus className="h-4 w-4" />
              Unassign Lead
            </button>
          </div>

          {!isUnassign && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1.5">
                Select Approved Astrologer
              </label>
              <select
                required
                value={selectedAstrologerId}
                onChange={(e) => setSelectedAstrologerId(e.target.value)}
                className="w-full rounded-xl border border-gold/25 bg-parchment/20 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:bg-white"
              >
                <option value="">-- Choose Vedic Astrologer --</option>
                {eligibleAstrologers.map((astro) => (
                  <option key={astro.id} value={astro.id}>
                    {astro.display_name} ({astro.city ?? "No location"} · {astro.experience_years ?? 0} yrs exp)
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-1">
              Assignment Reason / Notes
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Specialty match in Vedic Astrology and Kundli guidance"
              className="w-full rounded-xl border border-gold/25 bg-parchment/20 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:bg-white"
            />
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gold/20">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gold/30 bg-white px-3.5 py-1.5 text-xs font-semibold text-midnight hover:bg-gold/15"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-midnight px-4 py-1.5 text-xs font-semibold text-champagne hover:bg-plum disabled:opacity-50 shadow-xs"
            >
              {loading ? "Assigning..." : isUnassign ? "Confirm Unassign" : "Confirm Assignment"}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}
