"use client";

import { useState, useEffect } from "react";
import { X, CheckCircle2, XCircle, AlertCircle, ShieldAlert, Sparkles, MapPin, Briefcase, IndianRupee } from "lucide-react";
import { updateListingModerationStatus } from "@/app/actions/admin-listings";
import type { ApprovalStatus, AstrologerProfile } from "@/lib/types/database.types";

interface ListingModerationModalProps {
  listing: AstrologerProfile | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ListingModerationModal({
  listing,
  isOpen,
  onClose,
  onSuccess,
}: ListingModerationModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<ApprovalStatus>(
    listing?.approval_status && listing.approval_status !== "approved"
      ? listing.approval_status
      : "approved"
  );
  const [reviewNotes, setReviewNotes] = useState(listing?.review_notes ?? "");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (listing) {
      setSelectedStatus(
        listing.approval_status && listing.approval_status !== "approved"
          ? listing.approval_status
          : "approved"
      );
      setReviewNotes(listing.review_notes ?? "");
      setReason("");
      setError(null);
    }
  }, [listing, isOpen]);

  if (!isOpen || !listing) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const res = await updateListingModerationStatus({
      listingId: listing.id,
      status: selectedStatus,
      reviewNotes: reviewNotes.trim() || undefined,
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

  const requiresReason = ["rejected", "suspended", "changes_requested"].includes(selectedStatus);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-midnight/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-2xl border border-gold/40 bg-white p-6 shadow-2xl text-ink space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-gold/20 pb-4">
          <div>
            <h3 className="font-display text-lg font-bold text-midnight flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gold" />
              Listing Moderation & Verification
            </h3>
            <p className="text-xs text-muted">
              Applicant: <span className="font-semibold text-midnight">{listing.display_name}</span> ({listing.city ?? "Location unlisted"})
            </p>
          </div>
          <button
            onClick={onClose}
            type="button"
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-muted hover:bg-gold/15 hover:text-midnight transition-colors"
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

        {/* Profile Details Inspection Box */}
        <div className="rounded-xl border border-gold/20 bg-parchment/40 p-3.5 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted text-[11px]">
            {listing.experience_years && (
              <span className="flex items-center gap-1">
                <Briefcase className="h-3 w-3 text-gold" />
                {listing.experience_years} years exp
              </span>
            )}
            {listing.city && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3 text-teal" />
                {listing.city}, {listing.state ?? ""}
              </span>
            )}
            {listing.consultation_fee && (
              <span className="flex items-center gap-1 font-semibold text-midnight">
                <IndianRupee className="h-3 w-3 text-gold-deep" />
                ₹{listing.consultation_fee} fee
              </span>
            )}
          </div>

          {listing.specializations && listing.specializations.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1">
              {listing.specializations.map((spec) => (
                <span
                  key={spec}
                  className="rounded-md bg-gold/15 px-2 py-0.5 text-[10px] font-semibold text-gold-deep"
                >
                  {spec}
                </span>
              ))}
            </div>
          )}

          {listing.bio && (
            <p className="text-[11px] text-ink/80 italic line-clamp-3 pt-1 border-t border-gold/15">
              &ldquo;{listing.bio}&rdquo;
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-muted mb-2">
              Action / Moderation Decision
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { status: "approved", label: "Approve", icon: CheckCircle2, activeBg: "border-emerald-600 bg-emerald-600 text-white" },
                { status: "changes_requested", label: "Request Changes", icon: AlertCircle, activeBg: "border-amber-600 bg-amber-600 text-white" },
                { status: "rejected", label: "Reject", icon: XCircle, activeBg: "border-red-600 bg-red-600 text-white" },
                { status: "suspended", label: "Suspend", icon: ShieldAlert, activeBg: "border-rose-700 bg-rose-700 text-white" },
              ].map((opt) => {
                const Icon = opt.icon;
                const isSelected = selectedStatus === opt.status;

                return (
                  <button
                    key={opt.status}
                    type="button"
                    onClick={() => setSelectedStatus(opt.status as ApprovalStatus)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-2.5 text-center text-xs font-semibold transition-all ${
                      isSelected
                        ? `${opt.activeBg} shadow-sm scale-102`
                        : "border-gold/25 bg-white text-muted hover:bg-gold/10 hover:text-midnight"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-midnight mb-1">
              Review Notes (visible in astrologer self-service dashboard)
            </label>
            <textarea
              rows={2}
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="e.g. Please verify your certificates and upload a clear portrait."
              className="w-full rounded-xl border border-gold/25 bg-parchment/20 p-2.5 text-xs text-midnight outline-none focus:border-gold focus:bg-white"
            />
          </div>

          {requiresReason && (
            <div>
              <label className="block text-xs font-semibold text-midnight mb-1">
                Mandatory Audit Reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Required for administrative compliance audit"
                className="w-full rounded-xl border border-red-300 bg-red-50/20 p-2.5 text-xs text-midnight outline-none focus:border-red-500"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gold/20">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gold/30 bg-white px-4 py-2 text-xs font-semibold text-midnight hover:bg-gold/15"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-midnight px-4 py-2 text-xs font-semibold text-champagne hover:bg-plum disabled:opacity-50 shadow-xs"
            >
              {loading ? "Recording..." : "Confirm & Propagate"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
